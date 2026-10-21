# PCF85063A real-time clock/calendar (NXP), MicroPython driver.
# I2C address 0x51 (write A2h / read A3h). Registers per the NXP PCF85063A datasheet (Table 4):
# 00h Control_1 (EXT_TEST, STOP, SR, CIE, 12_24, CAP_SEL), 01h Control_2 (AIE, AF, MI, HMI, TF, COF[2:0]),
# 02h Offset, 03h RAM_byte, 04h-0Ah seconds..years (BCD, auto-increment),
# 0Bh-0Fh alarms (bit 7 AEN_x = 1 disables that field), 10h/11h countdown timer.
_ADDR = 0x51
_CTRL1 = 0x00
_CTRL2 = 0x01
_RAM = 0x03
_SECONDS = 0x04
_ALARM = 0x0B


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 0 = Sunday ... 6 = Saturday, the PCF85063A's weekday coding (Table 24).
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7


class PCF85063A:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([v & 0xFF]))

    def reset(self):
        """Software reset (58h to Control_1): all registers to their reset values, time 00:00:00 1 Jan 2000."""
        self._w(_CTRL1, 0x58)

    def datetime(self, dt=None):
        """Read or set the time.
        Read returns (year, month, day, weekday, hour, minute, second), weekday 0 = Sunday.
        Set with (year, month, day, hour, minute, second); the weekday is worked out for you."""
        if dt is None:
            # One burst 04h-0Ah: the chip blocks the counters during the access (datasheet 7.4).
            r = self.i2c.readfrom_mem(self.addr, _SECONDS, 7)
            hr = r[2]
            if self._r(_CTRL1) & 0x02:  # 12-hour mode: bit 5 = PM, hours 1-12
                h = _dec(hr & 0x1F) % 12 + (12 if hr & 0x20 else 0)
            else:
                h = _dec(hr & 0x3F)
            return (2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[3] & 0x3F), r[4] & 0x07,
                    h, _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2000 <= y <= 2099:
            raise ValueError('year must be 2000-2099')
        c1 = self._r(_CTRL1) & 0x05  # keep CIE and CAP_SEL; 12_24 = 0 (24-hour mode), EXT_TEST = 0
        self._w(_CTRL1, c1 | 0x20)   # STOP = 1: hold the prescaler while setting
        self.i2c.writeto_mem(self.addr, _SECONDS, bytes([
            _bcd(s),  # OS = 0 clears the oscillator-stop flag
            _bcd(mi), _bcd(h), _bcd(d), _weekday(y, mo, d), _bcd(mo), _bcd(y - 2000)]))
        self._w(_CTRL1, c1)          # STOP = 0: clock runs, the first second starts now

    def lost_power(self):
        """True if OS is set: the oscillator stopped (first power-up, or supply/battery too low); time is invalid."""
        return bool(self._r(_SECONDS) & 0x80)

    def clkout(self, hz):
        """Square wave on CLKOUT (push-pull): 32768, 16384, 8192, 4096, 2048, 1024, 1, or 0/None for off (LOW)."""
        codes = {32768: 0, 16384: 1, 8192: 2, 4096: 3, 2048: 4, 1024: 5, 1: 6}
        cof = 7 if not hz else codes[hz]
        c2 = self._r(_CTRL2) & 0xB8 | 0x40  # keep AIE, MI, HMI, TF; AF written 1 = unchanged
        self._w(_CTRL2, (c2 & 0xF8) | cof)

    def set_alarm(self, second=None, minute=None, hour=None, day=None, weekday=None, interrupt=True):
        """Alarm on the fields given (None = ignore that field, 24-hour mode). AF is set on a match;
        INT goes low if interrupt."""
        f = lambda v: 0x80 if v is None else _bcd(v)
        self.i2c.writeto_mem(self.addr, _ALARM, bytes([f(second), f(minute), f(hour), f(day),
                                                       0x80 if weekday is None else weekday & 0x07]))
        c2 = self._r(_CTRL2) & 0x3F  # keep MI, HMI, TF, COF; AF written 0 clears it
        self._w(_CTRL2, c2 | (0x80 if interrupt else 0))

    def alarm_fired(self):
        return bool(self._r(_CTRL2) & 0x40)

    def clear_alarm(self):
        """Clear AF (INT is released); the alarm stays armed."""
        self._w(_CTRL2, self._r(_CTRL2) & 0xBF)

    def disable_alarm(self):
        self.i2c.writeto_mem(self.addr, _ALARM, b'\x80\x80\x80\x80\x80')
        self._w(_CTRL2, self._r(_CTRL2) & 0x3F)  # AIE = 0, AF cleared

    def ram(self, value=None):
        """Read or write the one free RAM byte (03h)."""
        if value is None:
            return self._r(_RAM)
        self._w(_RAM, value)
