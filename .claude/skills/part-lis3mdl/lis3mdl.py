# LIS3MDL 3-axis magnetometer (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet DocID024204 Rev 4: WHO_AM_I 0x0F = 0x3D, CTRL_REG1..5 at 0x20..0x24,
# STATUS_REG 0x27, OUT_X_L..OUT_Z_H at 0x28..0x2D (two's complement, LSB at the lower address).
# In I2C the MSb of the register address asks for auto-increment, so a 6-byte burst starts at 0x28 | 0x80.
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x20
_CTRL_REG2 = 0x21
_CTRL_REG3 = 0x22
_CTRL_REG4 = 0x23
_CTRL_REG5 = 0x24
_STATUS_REG = 0x27
_OUT_X_L = 0x28

# Full scale (gauss) -> (FS[1:0] bits for CTRL_REG2, sensitivity in LSB/gauss), datasheet Tables 3 and 25.
_RANGES = {4: (0x00, 6842), 8: (0x20, 3421), 12: (0x40, 2281), 16: (0x60, 1711)}


class LIS3MDL:
    def __init__(self, i2c, addr=0x1C, range_gauss=4):
        """addr 0x1C with SDO/SA1 (the board's DO pin) low, 0x1E with it high."""
        self.i2c = i2c
        self.addr = addr
        who = self._r(_WHO_AM_I, 1)[0]
        if who != 0x3D:
            raise OSError('LIS3MDL not found (WHO_AM_I=0x%02X): check wiring and address' % who)
        if range_gauss not in _RANGES:
            raise ValueError('range_gauss must be 4, 8, 12 or 16')
        fs_bits, self._sens = _RANGES[range_gauss]
        # CTRL_REG1: TEMP_EN=0, OM=11 (X/Y ultra-high-performance), DO=100 (10 Hz), FAST_ODR=0, ST=0
        self._w(_CTRL_REG1, 0x70)
        # CTRL_REG2: full scale (other bits must be 0)
        self._w(_CTRL_REG2, fs_bits)
        # CTRL_REG4: OMZ=11 (Z ultra-high-performance), BLE=0 (LSB at lower address)
        self._w(_CTRL_REG4, 0x0C)
        # CTRL_REG5: BDU=1 so a reading's low and high bytes always belong together
        self._w(_CTRL_REG5, 0x40)
        # CTRL_REG3: MD=00 continuous conversion (leaves power-down, the reset default)
        self._w(_CTRL_REG3, 0x00)
        time.sleep_ms(110)  # first sample at 10 Hz

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read_raw(self):
        """Raw signed counts (x, y, z)."""
        for _ in range(50):  # wait for ZYXDA, at most about 0.5 s
            if self._r(_STATUS_REG, 1)[0] & 0x08:
                break
            time.sleep_ms(10)
        d = self._r(_OUT_X_L | 0x80, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)
            out.append(v - 65536 if v & 0x8000 else v)
        return tuple(out)

    def read(self):
        """Magnetic field (x, y, z) in gauss (1 gauss = 100 uT)."""
        x, y, z = self.read_raw()
        s = self._sens
        return x / s, y / s, z / s

    def read_ut(self):
        """Magnetic field (x, y, z) in microtesla."""
        return tuple(v * 100 for v in self.read())
