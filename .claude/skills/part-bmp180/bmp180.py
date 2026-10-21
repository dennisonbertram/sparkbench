# BMP180 barometric pressure & temperature sensor (Bosch BST-BMP180-DS000-09), MicroPython driver.
# Follows the datasheet flow (section 3.3) and integer algorithm (section 3.5, figure 4):
# read the 11 calibration words from E2PROM 0xAA-0xBF, write 0x2E to 0xF4 and wait 4.5 ms for UT,
# write 0x34 + (oss << 6) to 0xF4 and wait 4.5/7.5/13.5/25.5 ms for UP, then compensate.
# Divisions and shifts round down (floor), which reproduces the datasheet's worked example exactly.
import time
from micropython import const

_REG_CHIP_ID = const(0xD0)
_REG_CTRL = const(0xF4)
_REG_OUT = const(0xF6)
_CHIP_ID = const(0x55)
# Maximum pressure conversion times (datasheet table 3) for oss 0..3, in microseconds.
_P_WAIT_US = (4500, 7500, 13500, 25500)


def _s16(v):
    return v - 0x10000 if v & 0x8000 else v


class BMP180:
    def __init__(self, i2c, addr=0x77, oss=3):
        if oss not in (0, 1, 2, 3):
            raise ValueError('oss must be 0-3')
        self.i2c = i2c
        self.addr = addr
        self.oss = oss
        chip = i2c.readfrom_mem(addr, _REG_CHIP_ID, 1)[0]
        if chip != _CHIP_ID:
            raise OSError('BMP180 not found (chip id 0x%02X, expected 0x55)' % chip)
        c = i2c.readfrom_mem(addr, 0xAA, 22)
        w = [(c[i] << 8) | c[i + 1] for i in range(0, 22, 2)]
        self.AC1, self.AC2, self.AC3 = _s16(w[0]), _s16(w[1]), _s16(w[2])
        self.AC4, self.AC5, self.AC6 = w[3], w[4], w[5]  # unsigned
        self.B1, self.B2 = _s16(w[6]), _s16(w[7])
        self.MB, self.MC, self.MD = _s16(w[8]), _s16(w[9]), _s16(w[10])

    def _raw_temp(self):
        self.i2c.writeto_mem(self.addr, _REG_CTRL, b'\x2e')
        time.sleep_us(4500)
        d = self.i2c.readfrom_mem(self.addr, _REG_OUT, 2)
        return (d[0] << 8) | d[1]

    def _raw_press(self):
        oss = self.oss
        self.i2c.writeto_mem(self.addr, _REG_CTRL, bytes([0x34 + (oss << 6)]))
        time.sleep_us(_P_WAIT_US[oss])
        d = self.i2c.readfrom_mem(self.addr, _REG_OUT, 3)
        return ((d[0] << 16) | (d[1] << 8) | d[2]) >> (8 - oss)

    def _b5(self, ut):
        x1 = ((ut - self.AC6) * self.AC5) >> 15
        x2 = (self.MC << 11) // (x1 + self.MD)
        return x1 + x2

    def read(self):
        """Measure once; return (temperature in °C, pressure in Pa)."""
        oss = self.oss
        b5 = self._b5(self._raw_temp())
        t = ((b5 + 8) >> 4) / 10  # datasheet gives T in 0.1 °C steps
        up = self._raw_press()
        b6 = b5 - 4000
        x1 = (self.B2 * ((b6 * b6) >> 12)) >> 11
        x2 = (self.AC2 * b6) >> 11
        x3 = x1 + x2
        b3 = (((self.AC1 * 4 + x3) << oss) + 2) >> 2
        x1 = (self.AC3 * b6) >> 13
        x2 = (self.B1 * ((b6 * b6) >> 12)) >> 16
        x3 = ((x1 + x2) + 2) >> 2
        b4 = (self.AC4 * ((x3 + 32768) & 0xFFFFFFFF)) >> 15
        b7 = ((up - b3) & 0xFFFFFFFF) * (50000 >> oss)
        if b7 < 0x80000000:
            p = (b7 * 2) // b4
        else:
            p = (b7 // b4) * 2
        x1 = (p >> 8) * (p >> 8)
        x1 = (x1 * 3038) >> 16
        x2 = (-7357 * p) >> 16
        p = p + ((x1 + x2 + 3791) >> 4)
        return t, p

    def temperature(self):
        return self.read()[0]

    def pressure(self):
        """Pressure in Pa (1 hPa = 100 Pa)."""
        return self.read()[1]

    def altitude(self, p0=101325):
        """Altitude in metres from the datasheet's barometric formula (section 3.6); p0 = sea-level pressure in Pa."""
        return 44330 * (1 - (self.pressure() / p0) ** (1 / 5.255))
