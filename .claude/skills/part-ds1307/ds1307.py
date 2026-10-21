# DS1307 real-time clock (Analog Devices / Maxim DS1307), MicroPython driver.
# Registers 0x00-0x06 hold seconds, minutes, hours, day-of-week, date, month, year in BCD;
# 0x07 is the control register (SQW/OUT pin); 0x08-0x3F are 56 bytes of battery-backed RAM.
# Bit 7 of 0x00 is CH (clock halt): it is 1 after first power-up, so the clock does not run
# until the time is set. The chip is a standard-mode (100 kHz) I2C device only.

_ADDR = 0x68


def _bcd2dec(b):
    return (b >> 4) * 10 + (b & 0x0F)


def _dec2bcd(n):
    return ((n // 10) << 4) | (n % 10)


class DS1307:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr

    def datetime(self, dt=None):
        """Read or set the time.

        Returns (year, month, day, weekday, hour, minute, second). weekday is 1-7 and
        user-defined (the chip just counts it up at midnight); this library uses 1 = Monday.
        Pass the same tuple to set the clock; setting also clears CH, starting the oscillator.
        """
        if dt is None:
            r = self.i2c.readfrom_mem(self.addr, 0x00, 7)
            sec = _bcd2dec(r[0] & 0x7F)
            minute = _bcd2dec(r[1] & 0x7F)
            h = r[2]
            if h & 0x40:  # 12-hour mode: bit 5 = PM, bits 4-0 = 1-12
                hour = _bcd2dec(h & 0x1F) % 12
                if h & 0x20:
                    hour += 12
            else:  # 24-hour mode
                hour = _bcd2dec(h & 0x3F)
            wday = r[3] & 0x07
            day = _bcd2dec(r[4] & 0x3F)
            month = _bcd2dec(r[5] & 0x1F)
            year = 2000 + _bcd2dec(r[6])
            return (year, month, day, wday, hour, minute, sec)
        year, month, day, wday, hour, minute, sec = dt[:7]
        # One write from 0x00: seconds first (resets the divider chain, CH = 0),
        # then the rest within the same second. Hours written in 24-hour mode (bit 6 = 0).
        buf = bytes([
            _dec2bcd(sec) & 0x7F,
            _dec2bcd(minute),
            _dec2bcd(hour) & 0x3F,
            wday & 0x07,
            _dec2bcd(day),
            _dec2bcd(month),
            _dec2bcd(year % 100),
        ])
        self.i2c.writeto_mem(self.addr, 0x00, buf)

    def halted(self):
        """True while the oscillator is stopped (CH = 1), e.g. after first power-up."""
        return bool(self.i2c.readfrom_mem(self.addr, 0x00, 1)[0] & 0x80)

    def halt(self, stop=True):
        """Stop (True) or restart (False) the clock without changing the seconds."""
        s = self.i2c.readfrom_mem(self.addr, 0x00, 1)[0]
        s = (s | 0x80) if stop else (s & 0x7F)
        self.i2c.writeto_mem(self.addr, 0x00, bytes([s]))

    def square_wave(self, freq=None, out=0):
        """SQW/OUT pin (open drain, needs a pull-up): freq 1, 4096, 8192 or 32768 Hz,
        or None to disable it and drive the pin to `out` (0 or 1)."""
        rates = {1: 0x00, 4096: 0x01, 8192: 0x02, 32768: 0x03}
        if freq is None:
            ctrl = 0x80 if out else 0x00
        else:
            ctrl = 0x10 | rates[freq]
        self.i2c.writeto_mem(self.addr, 0x07, bytes([ctrl]))

    def read_ram(self, offset, n):
        """Read n bytes of the 56-byte battery-backed RAM (offset 0-55)."""
        if offset < 0 or offset + n > 56:
            raise ValueError('DS1307 RAM is 56 bytes')
        return self.i2c.readfrom_mem(self.addr, 0x08 + offset, n)

    def write_ram(self, offset, data):
        if offset < 0 or offset + len(data) > 56:
            raise ValueError('DS1307 RAM is 56 bytes')
        self.i2c.writeto_mem(self.addr, 0x08 + offset, bytes(data))
