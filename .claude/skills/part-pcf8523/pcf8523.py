# PCF8523 real-time clock/calendar (NXP), MicroPython driver.
# I2C address 0x68 (write D0h / read D1h). Registers per the NXP PCF8523 datasheet Rev. 7 (Table 6):
# 00h Control_1 (CAP_SEL, T, STOP, SR, 12_24, SIE, AIE, CIE), 01h Control_2 (WTAF, CTAF, CTBF, SF, AF,
# WTAIE, CTAIE, CTBIE), 02h Control_3 (PM[2:0], BSF, BLF, BSIE, BLIE),
# 03h-09h seconds, minutes, hours, days, weekdays, months, years (BCD, auto-increment),
# 0Ah-0Dh alarms (minute, hour, day, weekday; bit 7 AEN_x = 1 disables that field),
# 0Eh Offset, 0Fh Tmr_CLKOUT_ctrl (COF[2:0] in bits 5-3).
_ADDR = 0x68
_CTRL1 = 0x00
_CTRL2 = 0x01
_CTRL3 = 0x02
_SECONDS = 0x03
_ALARM = 0x0A
_CLKOUT = 0x0F


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 0 = Sunday ... 6 = Saturday, the PCF8523's default weekday assignment (Table 18).
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7


class PCF8523:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([v & 0xFF]))

    def reset(self):
        """Software reset (58h to Control_1, datasheet 8.3). Control registers return to their reset values and OS is set; time counters are left unchanged."""
        self._w(_CTRL1, 0x58)

    def battery_switchover(self, on=True):
        """PM[2:0] in Control_3. Power-on default is 111 = switch-over OFF (the coin cell is not used).
        on=True writes 000: switch-over in standard mode plus battery-low detection, so the clock keeps
        running from the CR1220 when VCC is removed."""
        c3 = self._r(_CTRL3) & 0x0B  # keep BSF, BSIE, BLIE (BLF is read-only)
        self._w(_CTRL3, c3 | (0x00 if on else 0xE0))

    def datetime(self, dt=None):
        """Read or set the time.
        Read returns (year, month, day, weekday, hour, minute, second), weekday 0 = Sunday.
        Set with (year, month, day, hour, minute, second); the weekday is worked out for you.
        Setting also switches the chip to 24-hour mode and enables coin-cell backup."""
        if dt is None:
            # One burst 03h-09h: the chip blocks its counters during the access (datasheet 8.6.8).
            r = self.i2c.readfrom_mem(self.addr, _SECONDS, 7)
            hr = r[2]
            if self._r(_CTRL1) & 0x08:  # 12_24 = 1: 12-hour mode, bit 5 = PM, hours 1-12
                h = _dec(hr & 0x1F) % 12 + (12 if hr & 0x20 else 0)
            else:
                h = _dec(hr & 0x3F)
            return (2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[3] & 0x3F), r[4] & 0x07,
                    h, _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2000 <= y <= 2099:
            raise ValueError('year must be 2000-2099')
        c1 = self._r(_CTRL1) & 0x87  # keep CAP_SEL, SIE, AIE, CIE; T = 0, SR = 0, 12_24 = 0 (24-hour)
        self._w(_CTRL1, c1 | 0x20)   # STOP = 1: freeze the divider chain while setting
        # Seconds through years in one access (datasheet 8.6.8); OS = 0 clears the oscillator-stop flag.
        self.i2c.writeto_mem(self.addr, _SECONDS, bytes([
            _bcd(s), _bcd(mi), _bcd(h), _bcd(d), _weekday(y, mo, d), _bcd(mo), _bcd(y - 2000)]))
        self._w(_CTRL1, c1)          # STOP = 0: clock runs, the first second starts now
        self.battery_switchover(True)

    def lost_power(self):
        """True if OS is set: the oscillator stopped (first power-up, or no coin cell); time is invalid."""
        return bool(self._r(_SECONDS) & 0x80)

    def battery_low(self):
        """BLF (Control_3 bit 2): coin cell below about 2.5 V. Needs battery_switchover(True) (PM = 000)."""
        return bool(self._r(_CTRL3) & 0x04)

    def clkout(self, hz):
        """Square wave on SQW (open-drain, needs a pull-up): 32768, 16384, 8192, 4096, 1024, 32, 1,
        or 0/None for off (high-Z). Power-on default is 32768."""
        codes = {32768: 0, 16384: 1, 8192: 2, 4096: 3, 1024: 4, 32: 5, 1: 6}
        cof = 7 if not hz else codes[hz]
        r = self._r(_CLKOUT) & 0xC7  # keep TAM, TBM, TAC, TBC
        self._w(_CLKOUT, r | (cof << 3))

    def _ctrl2_clear(self, mask):
        # Flags are cleared by writing 0 and left alone by writing 1 (datasheet 8.7.5, Table 27);
        # the interrupt-enable bits 2-0 are rewritten with their previous values.
        c2 = self._r(_CTRL2)
        self._w(_CTRL2, (0x78 & ~mask) | (c2 & 0x07))

    def set_alarm(self, minute=None, hour=None, day=None, weekday=None, interrupt=True):
        """Alarm on the fields given (None = ignore that field, 24-hour mode). AF is set on a match;
        with interrupt=True the INT1/SQW pin goes LOW (only when CLKOUT is off: call clkout(0))."""
        f = lambda v: 0x80 if v is None else _bcd(v)
        self.i2c.writeto_mem(self.addr, _ALARM, bytes([f(minute), f(hour), f(day),
                                                       0x80 if weekday is None else weekday & 0x07]))
        self._ctrl2_clear(0x08)
        c1 = self._r(_CTRL1) & 0xBF & ~0x02  # T = 0
        self._w(_CTRL1, c1 | (0x02 if interrupt else 0))

    def alarm_fired(self):
        return bool(self._r(_CTRL2) & 0x08)

    def clear_alarm(self):
        """Clear AF (INT1 is released); the alarm stays armed."""
        self._ctrl2_clear(0x08)

    def disable_alarm(self):
        self.i2c.writeto_mem(self.addr, _ALARM, b'\x80\x80\x80\x80')
        self._w(_CTRL1, self._r(_CTRL1) & 0xBD)  # AIE = 0, T = 0
        self._ctrl2_clear(0x08)
