# MMA8451Q 3-axis 14-bit accelerometer (NXP/Freescale), MicroPython driver for I2C.
# Register map and start-up sequence from the NXP MMA8451Q datasheet (Rev. 8.1):
#   STATUS 0x00, OUT_X_MSB..OUT_Z_LSB 0x01-0x06 (14-bit two's complement, left-justified:
#   MSB register = bits 13:6, LSB register bits 7:2 = bits 5:0), WHO_AM_I 0x0D = 0x1A,
#   XYZ_DATA_CFG 0x0E (FS[1:0]: 00 = 2 g, 01 = 4 g, 10 = 8 g),
#   CTRL_REG1 0x2A (DR[2:0] in bits 5:3, LNOISE bit 2, F_READ bit 1, ACTIVE bit 0).
# Sensitivity (14-bit): 4096 counts/g (2 g), 2048 (4 g), 1024 (8 g).
# Configuration registers can only be changed in standby (ACTIVE = 0).
# Reads need a repeated start, which readfrom_mem() does.
import time

_STATUS = 0x00
_OUT_X_MSB = 0x01
_WHO_AM_I = 0x0D
_XYZ_DATA_CFG = 0x0E
_CTRL_REG1 = 0x2A

_FS = {2: 0b00, 4: 0b01, 8: 0b10}
_ODR = {800: 0, 400: 1, 200: 2, 100: 3, 50: 4, 12.5: 5, 6.25: 6, 1.56: 7}


class MMA8451:
    def __init__(self, i2c, addr=0x1D, g_range=2, odr=100):
        """addr: 0x1D with SA0 high (Adafruit breakout default), 0x1C with A tied to GND.
        g_range: 2, 4 or 8 (g). odr: output data rate in Hz (800 ... 1.56)."""
        if g_range not in _FS:
            raise ValueError('g_range must be 2, 4 or 8')
        if odr not in _ODR:
            raise ValueError('odr must be 800, 400, 200, 100, 50, 12.5, 6.25 or 1.56')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x1A:
            raise OSError('MMA8451 not found (WHO_AM_I 0x%02X, expected 0x1A): check wiring and address' % who)
        self._counts_per_g = 4096 >> _FS[g_range]
        self._w(_CTRL_REG1, 0x00)               # standby: required before changing settings
        self._w(_XYZ_DATA_CFG, _FS[g_range])    # full-scale range, high-pass filter off
        # Data rate, normal noise mode, F_READ = 0 (full 14-bit reads), ACTIVE.
        self._w(_CTRL_REG1, (_ODR[odr] << 3) | 0x01)
        # Turn-on time from standby is 2/ODR + 1 ms.
        time.sleep_ms(int(2000 / odr) + 2)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when a new X/Y/Z sample is available (STATUS bit 3, ZYXDR)."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) signed 14-bit counts, read in one burst so all axes are from the same sample."""
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_MSB, 6)
        out = []
        for i in (0, 2, 4):
            v = (d[i] << 8) | d[i + 1]   # MSB first; 14-bit value is left-justified
            if v & 0x8000:
                v -= 65536
            out.append(v >> 2)           # arithmetic shift keeps the sign
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        c = self._counts_per_g
        x, y, z = self.raw()
        return x / c, y / c, z / c

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
