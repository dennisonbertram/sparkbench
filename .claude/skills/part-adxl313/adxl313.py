# MicroPython driver for the Analog Devices ADXL313 3-axis accelerometer (I2C).
# Written from the ADXL313 data sheet, Rev. C:
#   register map table 14: DEVID_0 0x00 = 0xAD, DEVID_1 0x01 = 0x1D, PARTID 0x02 = 0xCB,
#   SOFT_RESET 0x18 (write 0x52), BW_RATE 0x2C (reset 0x0A = 100 Hz),
#   POWER_CTL 0x2D (I2C_DISABLE bit 6 must stay 0, Measure = bit 3),
#   DATA_FORMAT 0x31 (FULL_RES bit 3, Justify bit 2, Range bits 1:0: 0.5/1/2/4 g),
#   DATA_X0..DATA_Z1 0x32-0x37 (twos complement, DATA_x0 = least significant byte),
#   full-resolution sensitivity 1024 LSB/g in every range (table 1).
import time

REG_DEVID_0 = 0x00      # reads 0xAD
REG_DEVID_1 = 0x01      # reads 0x1D
REG_PARTID = 0x02       # reads 0xCB
REG_SOFT_RESET = 0x18   # write 0x52 to reset
REG_BW_RATE = 0x2C      # LOW_POWER bit 4, Rate bits 3:0
REG_POWER_CTL = 0x2D    # I2C_DISABLE 6, Link 5, AUTO_SLEEP 4, Measure 3, Sleep 2, Wake-up 1:0
REG_DATA_FORMAT = 0x31  # SELF_TEST 7, SPI 6, INT_INVERT 5, FULL_RES 3, Justify 2, Range 1:0
REG_DATAX0 = 0x32       # 0x32..0x37: X0 X1 Y0 Y1 Z0 Z1

FULL_RES = 0x08
MEASURE = 0x08
LSB_PER_G = 1024        # full resolution, any range
STANDARD_GRAVITY = 9.80665

_RANGE_BITS = {0.5: 0, 1: 1, 2: 2, 4: 3}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v > 32767 else v


class ADXL313:
    def __init__(self, i2c, addr=0x1D, g_range=4, rate=0x0A):
        """addr 0x1D with SDO/ADR high (SparkFun board default, ADR jumper open),
        0x53 with ADR pulled to GND (jumper closed).
        g_range: 0.5, 1, 2 or 4 g. Full resolution keeps 1024 LSB/g in every range.
        rate: BW_RATE code (0x0A = 100 Hz, 0x0F = 3200 Hz)."""
        if g_range not in _RANGE_BITS:
            raise ValueError("g_range must be 0.5, 1, 2 or 4")
        self.i2c = i2c
        self.addr = addr
        ids = self._r(REG_DEVID_0, 3)
        if ids[0] != 0xAD or ids[1] != 0x1D or ids[2] != 0xCB:
            raise OSError("ADXL313 not found at 0x%02X (IDs %02X %02X %02X, expected AD 1D CB)"
                          % (addr, ids[0], ids[1], ids[2]))
        self._w(REG_POWER_CTL, 0x00)  # standby while configuring (I2C_DISABLE stays 0)
        self._w(REG_BW_RATE, rate & 0x0F)  # normal power (LOW_POWER = 0)
        # Full resolution, right-justified with sign extension, interrupts active high.
        self._w(REG_DATA_FORMAT, FULL_RES | _RANGE_BITS[g_range])
        self._w(REG_POWER_CTL, MEASURE)
        # Turn-on time is about 1.1 ms + 1/ODR: 11.1 ms at 100 Hz.
        time.sleep_ms(20)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def soft_reset(self):
        """Write 0x52 to SOFT_RESET; all registers return to reset values (standby)."""
        self._w(REG_SOFT_RESET, 0x52)
        time.sleep_ms(2)

    def raw(self):
        """(x, y, z) in LSB. One 6-byte burst read so the axes come from the same sample."""
        d = self._r(REG_DATAX0, 6)
        return _s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5])

    def read(self):
        """(x, y, z) acceleration in g."""
        x, y, z = self.raw()
        return x / LSB_PER_G, y / LSB_PER_G, z / LSB_PER_G

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        x, y, z = self.read()
        return x * STANDARD_GRAVITY, y * STANDARD_GRAVITY, z * STANDARD_GRAVITY
