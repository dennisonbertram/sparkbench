# MicroPython driver for the Analog Devices ADXL375 +/-200 g 3-axis accelerometer (I2C).
# Written from the ADXL375 data sheet, Rev. B:
#   register map table 15: DEVID 0x00 (0xE5), BW_RATE 0x2C, POWER_CTL 0x2D (Measure = bit 3),
#   DATA_FORMAT 0x31 (SELF_TEST 7, SPI 6, INT_INVERT 5, D4 = 0, D3 = 1, Justify 2, D1:D0 = 11),
#   DATAX0..DATAZ1 0x32-0x37 (twos complement, DATAx0 = least significant byte),
#   fixed 13-bit output, scale factor 49 mg/LSB (specifications table 1).
import time

REG_DEVID = 0x00        # reads 0xE5
REG_BW_RATE = 0x2C      # LOW_POWER bit 4, rate bits 3:0 (0x0A = 100 Hz, the reset value)
REG_POWER_CTL = 0x2D    # Link 5, AUTO_SLEEP 4, Measure 3, Sleep 2, Wakeup 1:0
REG_DATA_FORMAT = 0x31
REG_DATAX0 = 0x32       # 0x32..0x37: X0 X1 Y0 Y1 Z0 Z1

DEVID = 0xE5
MEASURE = 0x08
# DATA_FORMAT: bits D3, D1, D0 must be written as 1 and D4 as 0 (data sheet register 0x31);
# Justify = 0 (right justified with sign extension), INT_INVERT = 0, SPI = 0, SELF_TEST = 0.
DATA_FORMAT_VALUE = 0x0B
SCALE_G = 0.049         # g per LSB (49 mg/LSB, typ; 44-54 mg/LSB part to part)
STANDARD_GRAVITY = 9.80665


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v > 32767 else v


class ADXL375:
    def __init__(self, i2c, addr=0x53, rate=0x0A):
        """addr 0x53 with ALT ADDRESS (SDO) low (Adafruit board default), 0x1D with it high.
        rate: BW_RATE code (0x0A = 100 Hz). Max ODR is 800 Hz (0x0D) on 400 kHz I2C,
        200 Hz (0x0B) on 100 kHz. At 1600/3200 Hz the LSB of each word is always 0."""
        self.i2c = i2c
        self.addr = addr
        dev = self._r(REG_DEVID, 1)[0]
        if dev != DEVID:
            raise OSError("ADXL375 not found at 0x%02X (DEVID 0x%02X, expected 0xE5)" % (addr, dev))
        self._w(REG_POWER_CTL, 0x00)  # standby while configuring (data sheet recommendation)
        self._w(REG_BW_RATE, rate & 0x0F)  # normal power (LOW_POWER = 0)
        self._w(REG_DATA_FORMAT, DATA_FORMAT_VALUE)
        self._w(REG_POWER_CTL, MEASURE)
        # Turn-on time is about 1.1 ms + 1/ODR (table 1 note 8): 11.1 ms at 100 Hz.
        time.sleep_ms(20)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def raw(self):
        """(x, y, z) in LSB. One 6-byte burst read so the three axes come from the same sample."""
        d = self._r(REG_DATAX0, 6)
        return _s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5])

    def read(self):
        """(x, y, z) acceleration in g."""
        x, y, z = self.raw()
        return x * SCALE_G, y * SCALE_G, z * SCALE_G

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        x, y, z = self.read()
        return x * STANDARD_GRAVITY, y * STANDARD_GRAVITY, z * STANDARD_GRAVITY
