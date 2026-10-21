# MicroPython driver for the Analog Devices ADXL343 3-axis accelerometer (I2C).
# Written from the ADXL343 data sheet, Rev. 0:
#   register map table 19, DEVID 0xE5, BW_RATE 0x2C, POWER_CTL 0x2D (Measure = bit 3),
#   DATA_FORMAT 0x31 (FULL_RES = bit 3, Justify = bit 2, Range = bits 1:0),
#   DATAX0..DATAZ1 0x32-0x37 (twos complement, DATAx0 = least significant byte),
#   full-resolution scale factor 3.9 mg/LSB in every range (specifications table 1).
import time

REG_DEVID = 0x00        # reads 0xE5
REG_BW_RATE = 0x2C      # LOW_POWER bit 4, rate bits 3:0 (0x0A = 100 Hz, the reset value)
REG_POWER_CTL = 0x2D    # Link 5, AUTO_SLEEP 4, Measure 3, Sleep 2, Wakeup 1:0
REG_DATA_FORMAT = 0x31  # SELF_TEST 7, SPI 6, INT_INVERT 5, FULL_RES 3, Justify 2, Range 1:0
REG_DATAX0 = 0x32       # 0x32..0x37: X0 X1 Y0 Y1 Z0 Z1

DEVID = 0xE5
FULL_RES = 0x08
MEASURE = 0x08
SCALE_G = 0.0039        # g per LSB in full-resolution mode (3.9 mg/LSB), all ranges
STANDARD_GRAVITY = 9.80665

_RANGE_BITS = {2: 0, 4: 1, 8: 2, 16: 3}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v > 32767 else v


class ADXL343:
    def __init__(self, i2c, addr=0x53, g_range=16, rate=0x0A):
        """addr 0x53 with SDO/ALT ADDRESS low (Adafruit board default), 0x1D with it high.
        g_range: 2, 4, 8 or 16 (full resolution keeps 3.9 mg/LSB in every range).
        rate: BW_RATE code (0x0A = 100 Hz). Max ODR is 800 Hz (0x0D) on 400 kHz I2C, 200 Hz (0x0B) on 100 kHz."""
        if g_range not in _RANGE_BITS:
            raise ValueError("g_range must be 2, 4, 8 or 16")
        self.i2c = i2c
        self.addr = addr
        dev = self._r(REG_DEVID, 1)[0]
        if dev != DEVID:
            raise OSError("ADXL343 not found at 0x%02X (DEVID 0x%02X, expected 0xE5)" % (addr, dev))
        self._w(REG_POWER_CTL, 0x00)  # standby while configuring
        self._w(REG_BW_RATE, rate & 0x0F)  # normal power (LOW_POWER = 0)
        # Full resolution, right-justified with sign extension, interrupts active high, 4-wire SPI bit 0.
        self._w(REG_DATA_FORMAT, FULL_RES | _RANGE_BITS[g_range])
        self._w(REG_POWER_CTL, MEASURE)
        # Turn-on time is about 1.1 ms + 1/ODR (table 1 note 7): 11.1 ms at 100 Hz.
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
