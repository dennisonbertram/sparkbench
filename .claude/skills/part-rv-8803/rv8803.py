# RV-8803-C7 temperature-compensated real-time clock (Micro Crystal), MicroPython driver.
# I2C address 0x32. Registers per the Micro Crystal RV-8803-C7 Application Manual (Rev. 1.7):
# 00h-06h seconds, minutes, hours (always 24 h), weekday (one bit per day), date, month, year (BCD,
# address auto-increments; mirrored at 11h-17h), 10h hundredths of seconds (read only),
# 08h-0Ah alarm (bit 7 AE = 1 disables that field), 0Dh extension (WADA bit 6, TEST bit 7 must stay 0),
# 0Eh flags (AF bit 3, V2F bit 1, V1F bit 0), 0Fh control (AIE bit 3, RESET bit 0).
_ADDR = 0x32
_SECONDS = 0x00
_HUNDREDTHS = 0x10
_ALARM_MIN = 0x08
_EXT = 0x0D
_FLAGS = 0x0E
_CTRL = 0x0F

_WADA = 0x40
_AF = 0x08
_V2F = 0x02
_V1F = 0x01
_AIE = 0x08
_RESET = 0x01


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


def _dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _weekday(y, m, d):
    # 0 = Sunday ... 6 = Saturday (Sakamoto's method).
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return (y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7


class RV8803:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg, n=1):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, data):
        self.i2c.writeto_mem(self.addr, reg, bytes(data))

    def _read_time(self):
        # The RV-8803 cannot freeze its counters during a read (App. Manual 4.12). If the seconds read
        # 59, read again: if they changed, the first burst may be half-incremented, so use the second.
        r = self._r(_SECONDS, 7)
        if (r[0] & 0x7F) == 0x59:
            r2 = self._r(_SECONDS, 7)
            if (r2[0] & 0x7F) != 0x59:
                r = r2
        return r

    def datetime(self, dt=None):
        """Read or set the time (24-hour, years 2000-2099).
        Read returns (year, month, day, weekday, hour, minute, second), weekday 0 = Sunday,
        worked out from the date. Set with (year, month, day, hour, minute, second)."""
        if dt is None:
            r = self._read_time()
            y, mo, d = 2000 + _dec(r[6]), _dec(r[5] & 0x1F), _dec(r[4] & 0x3F)
            return (y, mo, d, _weekday(y, mo, d), _dec(r[2] & 0x3F), _dec(r[1] & 0x7F), _dec(r[0] & 0x7F))
        y, mo, d, h, mi, s = dt[:6]
        if not 2000 <= y <= 2099:
            raise ValueError('year must be 2000-2099')
        # App. Manual 4.13: RESET = 1 holds the prescaler (and clears the hundredths), write the
        # time, then RESET = 0 starts the clock exactly at the seconds written.
        c = self._r(_CTRL)[0] & 0x3D
        self._w(_CTRL, [c | _RESET])
        try:
            # Weekday register: exactly one bit set, bit n = weekday n (0 = Sunday).
            self._w(_SECONDS, [_bcd(s), _bcd(mi), _bcd(h), 1 << _weekday(y, mo, d),
                               _bcd(d), _bcd(mo), _bcd(y - 2000)])
        finally:
            self._w(_CTRL, [c & ~_RESET])
        f = self._r(_FLAGS)[0]
        self._w(_FLAGS, [f & 0x3C])  # clear V2F and V1F (POR / low-voltage flags): time is now valid

    def hundredths(self):
        """Hundredths of a second, 0-99."""
        return _dec(self._r(_HUNDREDTHS)[0])

    def lost_power(self):
        """True if V2F is set: power-on reset or the supply fell below VLOW2 (about 1.2 V),
        so the time is invalid until set."""
        return bool(self._r(_FLAGS)[0] & _V2F)

    def set_alarm(self, minute=None, hour=None, date=None, interrupt=True):
        """Alarm on the fields given (None = ignore that field; hour 0-23, date 1-31).
        AF is set on a match; the open-drain INT pin goes low if interrupt is True."""
        c = self._r(_CTRL)[0] & 0x3D
        self._w(_CTRL, [c & ~_AIE])  # AIE = 0 while changing the alarm
        f = self._r(_FLAGS)[0]
        self._w(_FLAGS, [f & ~_AF & 0x3F])  # AF = 0
        e = self._r(_EXT)[0] & 0x7F  # TEST must be written 0
        self._w(_EXT, [e | _WADA])  # WADA = 1: 0Ah is a date alarm
        g = lambda v: 0x80 if v is None else _bcd(v)
        self._w(_ALARM_MIN, [g(minute), g(hour), g(date)])
        if interrupt:
            self._w(_CTRL, [c | _AIE])

    def alarm_fired(self):
        return bool(self._r(_FLAGS)[0] & _AF)

    def clear_alarm(self):
        """Clear AF (INT is released); the alarm stays armed."""
        f = self._r(_FLAGS)[0]
        self._w(_FLAGS, [f & ~_AF & 0x3F])

    def disable_alarm(self):
        c = self._r(_CTRL)[0] & 0x3D
        self._w(_CTRL, [c & ~_AIE])
        self._w(_ALARM_MIN, [0x80, 0x80, 0x80])
        self.clear_alarm()
