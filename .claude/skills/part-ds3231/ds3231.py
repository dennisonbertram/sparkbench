# DS3231 extremely accurate I2C real-time clock (Maxim/Analog Devices DS3231), MicroPython driver.
# Register map from the datasheet (19-5170 Rev 10, Figure 1):
#   00h-06h seconds, minutes, hours, day (1-7), date, month/century, year, all BCD
#   0Eh control, 0Fh status (bit 7 = OSF, oscillator stopped), 11h-12h temperature
# The time registers are read in one burst so the chip's shadow registers give a consistent time.

_TIME = 0x00
_CONTROL = 0x0E
_STATUS = 0x0F
_TEMP = 0x11


def _bcd2bin(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _bin2bcd(n):
    return ((n // 10) << 4) | (n % 10)


def weekday(year, month, day):
    """Day of week, 1 = Monday ... 7 = Sunday (the DS3231 only needs it to be sequential)."""
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    y = year - 1 if month < 3 else year
    d = (y + y // 4 - y // 100 + y // 400 + t[month - 1] + day) % 7  # 0 = Sunday
    return 7 if d == 0 else d


class DS3231:
    def __init__(self, i2c, addr=0x68):
        self.i2c = i2c
        self.addr = addr

    def datetime(self):
        """Return (year, month, day, hour, minute, second, weekday) in 24-hour time."""
        r = self.i2c.readfrom_mem(self.addr, _TIME, 7)
        second = _bcd2bin(r[0] & 0x7F)
        minute = _bcd2bin(r[1] & 0x7F)
        h = r[2]
        if h & 0x40:  # 12-hour mode: bit 5 = PM, hours 1-12
            hour = _bcd2bin(h & 0x1F) % 12 + (12 if h & 0x20 else 0)
        else:  # 24-hour mode: bits 5-4 = tens of hours
            hour = _bcd2bin(h & 0x3F)
        wday = r[3] & 0x07
        day = _bcd2bin(r[4] & 0x3F)
        month = _bcd2bin(r[5] & 0x1F)
        year = 2000 + _bcd2bin(r[6]) + (100 if r[5] & 0x80 else 0)  # bit 7 of month = century
        return (year, month, day, hour, minute, second, wday)

    def set_datetime(self, year, month, day, hour, minute, second, wday=None):
        """Set the clock (24-hour mode) and clear the oscillator-stop flag."""
        if not 2000 <= year <= 2199:
            raise ValueError('year must be 2000-2199')
        if wday is None:
            wday = weekday(year, month, day)
        century = 0x80 if year >= 2100 else 0
        self.i2c.writeto_mem(self.addr, _TIME, bytes([
            _bin2bcd(second), _bin2bcd(minute), _bin2bcd(hour),  # bit 6 = 0: 24-hour mode
            wday, _bin2bcd(day), _bin2bcd(month) | century, _bin2bcd(year % 100)]))
        st = self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0]
        self.i2c.writeto_mem(self.addr, _STATUS, bytes([st & 0x7F]))  # OSF can only be written to 0

    def lost_power(self):
        """True if the oscillator has stopped since the time was last set (OSF, status bit 7):
        first power-up, or a flat/missing backup battery. The time is then not valid."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x80)

    def temperature(self):
        """Die temperature in degrees C, 0.25 C resolution (updated every 64 s by the chip)."""
        t = self.i2c.readfrom_mem(self.addr, _TEMP, 2)
        msb = t[0] - 256 if t[0] & 0x80 else t[0]  # two's complement integer part
        return msb + (t[1] >> 6) * 0.25  # bits 7-6 of 12h = quarter degrees
