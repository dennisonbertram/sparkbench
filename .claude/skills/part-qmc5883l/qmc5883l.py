# QMC5883L 3-axis magnetometer (QST QMC5883L datasheet rev 1.0), MicroPython driver.
# Setup per datasheet section 7.1: write 0x0B = 0x01 (SET/RESET period), then control register 1
# (0x09) = OSR | RNG | ODR | MODE=continuous. Poll DRDY (0x06 bit 0), then read 0x00..0x05:
# X, Y, Z as 16-bit two's complement, LSB first. Sensitivity: 12000 LSB/G (+-2 G), 3000 LSB/G (+-8 G).
import time

_REG_X_LSB = 0x00
_REG_STATUS = 0x06
_REG_TEMP_LSB = 0x07
_REG_CTRL1 = 0x09
_REG_CTRL2 = 0x0A
_REG_SET_RESET = 0x0B
_REG_CHIP_ID = 0x0D

RANGE_2G = 0x00
RANGE_8G = 0x10
_LSB_PER_GAUSS = {RANGE_2G: 12000, RANGE_8G: 3000}

ODR_10HZ = 0x00
ODR_50HZ = 0x04
ODR_100HZ = 0x08
ODR_200HZ = 0x0C

OSR_512 = 0x00
OSR_256 = 0x40
OSR_128 = 0x80
OSR_64 = 0xC0

_MODE_CONTINUOUS = 0x01


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


class QMC5883L:
    def __init__(self, i2c, addr=0x0D, rng=RANGE_8G, odr=ODR_200HZ, osr=OSR_512):
        self.i2c = i2c
        self.addr = addr
        self.rng = rng
        self.overflow = False
        # Soft reset (0x0A bit 7), then let the chip reload its defaults.
        self._write(_REG_CTRL2, 0x80)
        time.sleep_ms(10)
        self._write(_REG_SET_RESET, 0x01)  # recommended by the datasheet
        self._write(_REG_CTRL1, osr | rng | odr | _MODE_CONTINUOUS)  # defaults give 0x1D
        time.sleep_ms(10)

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def chip_id(self):
        """Register 0x0D, 0xFF on a genuine QMC5883L."""
        return self._read(_REG_CHIP_ID, 1)[0]

    def read_raw(self, timeout_ms=200):
        """Wait for DRDY, then return the raw (x, y, z) counts."""
        t0 = time.ticks_ms()
        while True:
            st = self._read(_REG_STATUS, 1)[0]
            if st & 0x01:
                break
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('QMC5883L: no data ready (check wiring / address 0x0D)')
            time.sleep_ms(2)
        self.overflow = bool(st & 0x02)  # OVL: an axis saturated, pick the 8 G range
        d = self._read(_REG_X_LSB, 6)  # reading through 0x05 releases the data lock
        return _s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5])

    def read(self):
        """Return the field (x, y, z) in gauss."""
        k = _LSB_PER_GAUSS[self.rng]
        x, y, z = self.read_raw()
        return x / k, y / k, z / k

    def temperature_raw(self):
        """Relative temperature, about 100 LSB per degree C; the offset is not calibrated."""
        d = self._read(_REG_TEMP_LSB, 2)
        return _s16(d[0], d[1])
