# PCF8563 real-time clock/calendar (NXP), MicroPython driver.
# I2C address 0x51 (write A2h / read A3h). Registers per the NXP datasheet:
# 00h control/status 1, 01h control/status 2, 02h-08h seconds..years (BCD, auto-increment),
# 09h-0Ch alarms (bit 7 AE = 1 disables that field), 0Dh CLKOUT control, 0Eh/0Fh timer.
_ADDR = 0x51
_CTRL1 = 0x00
_CTRL2 = 0x01
_SECONDS = 0x02
_ALARM = 0x09
_CLKOUT = 0x0D


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 0 = Sunday ... 6 = Saturday, the PCF8563's own weekday coding (Table 14).
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7


class PCF8563:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def datetime(self, dt=None):
        """Read or set the time.
        Read returns (year, month, day, weekday, hour, minute, second), weekday 0 = Sunday.
        Set with (year, month, day, hour, minute, second); the weekday is worked out for you."""
        if dt is None:
            r = self.i2c.readfrom_mem(self.addr, _SECONDS, 7)  # one burst: the chip freezes the counters while it is read
            # Century bit (07h bit 7) is ignored: years are taken as 2000-2099.
            return (2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[3] & 0x3F), r[4] & 0x07,
                    _dec(r[2] & 0x3F), _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2000 <= y <= 2099:
            raise ValueError('year must be 2000-2099')
        self.i2c.writeto_mem(self.addr, _CTRL1, b'\x20')  # STOP = 1: hold the divider chain while setting
        self.i2c.writeto_mem(self.addr, _SECONDS, bytes([
            _bcd(s),  # writing VL = 0 clears the voltage-low flag
            _bcd(mi), _bcd(h), _bcd(d), _weekday(y, mo, d),
            _bcd(mo),  # century bit 0 = 20xx
            _bcd(y - 2000)]))
        self.i2c.writeto_mem(self.addr, _CTRL1, b'\x00')  # STOP = 0, TESTC = 0: clock runs, normal mode

    def lost_power(self):
        """True if VL is set: the supply dropped too low and the time may be wrong (also true on first power-up)."""
        return bool(self.i2c.readfrom_mem(self.addr, _SECONDS, 1)[0] & 0x80)

    def clkout(self, hz):
        """Square wave on CLKOUT (open-drain): 32768, 1024, 32, 1, or 0/None to switch it off (saves current)."""
        codes = {32768: 0, 1024: 1, 32: 2, 1: 3}
        v = 0x00 if not hz else 0x80 | codes[hz]
        self.i2c.writeto_mem(self.addr, _CLKOUT, bytes([v]))

    def set_alarm(self, minute=None, hour=None, day=None, weekday=None, interrupt=True):
        """Alarm on the fields given (None = ignore that field). AF is set on a match; INT goes low if interrupt."""
        f = lambda v: 0x80 if v is None else _bcd(v)
        self.i2c.writeto_mem(self.addr, _ALARM, bytes([f(minute), f(hour), f(day), 0x80 if weekday is None else weekday & 0x07]))
        c2 = self.i2c.readfrom_mem(self.addr, _CTRL2, 1)[0] & 0x11  # keep TI/TP and TIE
        # AF written 0 clears it; TF written 1 leaves it unchanged.
        self.i2c.writeto_mem(self.addr, _CTRL2, bytes([c2 | 0x04 | (0x02 if interrupt else 0)]))

    def alarm_fired(self):
        return bool(self.i2c.readfrom_mem(self.addr, _CTRL2, 1)[0] & 0x08)

    def clear_alarm(self):
        """Clear AF (INT is released) and leave the alarm armed."""
        c2 = self.i2c.readfrom_mem(self.addr, _CTRL2, 1)[0] & 0x13
        self.i2c.writeto_mem(self.addr, _CTRL2, bytes([c2 | 0x04]))  # AF = 0 clears, TF = 1 unchanged

    def disable_alarm(self):
        self.i2c.writeto_mem(self.addr, _ALARM, b'\x80\x80\x80\x80')
        c2 = self.i2c.readfrom_mem(self.addr, _CTRL2, 1)[0] & 0x11  # keep TI/TP, TIE; AIE off
        self.i2c.writeto_mem(self.addr, _CTRL2, bytes([c2 | 0x04]))
