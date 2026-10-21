# ADXL345 3-axis accelerometer (Analog Devices), MicroPython driver for I2C.
# Register map, start-up sequence and data format from the ADXL345 datasheet:
#   DEVID 0x00 = 0xE5, BW_RATE 0x2C, POWER_CTL 0x2D (bit 3 = Measure),
#   DATA_FORMAT 0x31 (bit 3 = FULL_RES, bits 1:0 = range), DATAX0..DATAZ1 0x32-0x37
#   (two's complement, low byte first). In full-resolution mode the scale factor is
#   3.9 mg/LSB (256 LSB/g typical) in every range.
import time

_DEVID = 0x00
_BW_RATE = 0x2C
_POWER_CTL = 0x2D
_DATA_FORMAT = 0x31
_DATAX0 = 0x32

_RANGES = {2: 0b00, 4: 0b01, 8: 0b10, 16: 0b11}
_LSB_PER_G = 256  # full resolution, typical sensitivity


class ADXL345:
    def __init__(self, i2c, addr=0x53, g_range=2):
        """addr: 0x53 with SDO low (GY-291 default), 0x1D with SDO high.
        g_range: 2, 4, 8 or 16 (full-resolution mode keeps 3.9 mg/LSB)."""
        self.i2c = i2c
        self.addr = addr
        if g_range not in _RANGES:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        devid = self.i2c.readfrom_mem(addr, _DEVID, 1)[0]
        if devid != 0xE5:
            raise OSError('ADXL345 not found (DEVID 0x%02X, expected 0xE5): check wiring and CS high' % devid)
        self._w(_POWER_CTL, 0x00)                        # standby while configuring
        self._w(_BW_RATE, 0x0A)                          # 100 Hz output data rate, normal power
        self._w(_DATA_FORMAT, 0x08 | _RANGES[g_range])   # FULL_RES, right-justified, 4-wire SPI bit 0
        self._w(_POWER_CTL, 0x08)                        # Measure bit: start measuring
        time.sleep_ms(20)  # turn-on time at 100 Hz is about 11.1 ms (1/ODR + 1.1 ms)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def raw(self):
        """(x, y, z) raw counts. One 6-byte burst read, as the datasheet recommends,
        so the three axes come from the same sample."""
        d = self.i2c.readfrom_mem(self.addr, _DATAX0, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # DATAx0 = low byte, DATAx1 = high byte
            out.append(v - 65536 if v & 0x8000 else v)
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        x, y, z = self.raw()
        return x / _LSB_PER_G, y / _LSB_PER_G, z / _LSB_PER_G

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
