# IST8310 3-axis magnetometer (iSentek IST8310 datasheet v1.2 / v1.8), MicroPython driver.
# Power-on mode is stand-by. Datasheet 3.1.1: set PDCNTL (0x42) = 0xC0 and, for low noise,
# AVGCNTL (0x41) = 0x24. Each reading: write CNTL1 (0x0A) = 0x01 (single measurement), wait for
# DRDY (STAT1 0x02 bit 0), then read 0x03..0x08: X, Y, Z as 16-bit two's complement, LSB first.
# The chip returns to stand-by by itself. Sensitivity 3.3 LSB/uT (330 LSB/gauss).
import time

_REG_WAI = 0x00
_REG_STAT1 = 0x02
_REG_DATA_X_L = 0x03
_REG_STAT2 = 0x09
_REG_CNTL1 = 0x0A
_REG_CNTL2 = 0x0B
_REG_STR = 0x0C
_REG_AVGCNTL = 0x41
_REG_PDCNTL = 0x42

_DEVICE_ID = 0x10
_LSB_PER_UT = 3.3


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


class IST8310:
    def __init__(self, i2c, addr=0x0E, low_noise=True):
        self.i2c = i2c
        self.addr = addr
        self._write(_REG_CNTL2, 0x01)  # SRST: run the power-on-reset routine
        time.sleep_ms(50)  # POR takes at most 50 ms
        wai = self._read(_REG_WAI, 1)[0]
        if wai != _DEVICE_ID:
            raise OSError('IST8310: WHO_AM_I is 0x%02X, expected 0x10 (check address)' % wai)
        self._write(_REG_PDCNTL, 0xC0)  # normal set/reset pulse duration (datasheet 3.1.1)
        if low_noise:
            self._write(_REG_AVGCNTL, 0x24)  # average 16x on X/Z and Y, >= 6 ms per sample

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def read_raw(self, timeout_ms=100):
        """Start one measurement, wait for DRDY, return raw (x, y, z) counts."""
        self._write(_REG_CNTL1, 0x01)  # single measurement mode
        time.sleep_ms(6)
        t0 = time.ticks_ms()
        while not (self._read(_REG_STAT1, 1)[0] & 0x01):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('IST8310: no data ready')
            time.sleep_ms(1)
        d = self._read(_REG_DATA_X_L, 6)  # reading the data clears DRDY and DOR
        return _s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5])

    def read(self):
        """Return the field (x, y, z) in microtesla."""
        x, y, z = self.read_raw()
        return x / _LSB_PER_UT, y / _LSB_PER_UT, z / _LSB_PER_UT

    def strong_field(self):
        """STAT2 INT bit: |X|+|Y|+|Z| exceeded 1600 uT."""
        return bool(self._read(_REG_STAT2, 1)[0] & 0x08)
