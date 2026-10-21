# MSA301 3-axis accelerometer (MEMSensing Microsystems), MicroPython driver for I2C.
# From the MSA301 datasheet (V1.0, register map section):
#   I2C address 0b0100110 = 0x26. PARTID (0x01) reads 0x13.
#   ACC_X/Y/Z 0x02-0x07: low byte first; 14-bit two's complement, bits 13:6 in the MSB
#   register and bits 5:0 in bits 7:2 of the LSB register (left-justified in 16 bits).
#   0x0F RESOLUTION[3:2] (00 = 14 bit) FS[1:0] (00/01/10/11 = +-2/4/8/16 g).
#   Sensitivity (14 bit): 4096 / 2048 / 1024 / 512 LSB/g.
#   0x10 X/Y/Z_AXIS_DIS bits 7:5, ODR[3:0]. 0x11 PWR_MODE bits 7:6 (00 normal,
#   01 low power, 1x suspend); the power-on default 0x9E is SUSPEND, so the
#   driver must switch to normal mode before any data is produced.
import time

_ADDR = 0x26
_PARTID = 0x01
_ACC_X_LSB = 0x02
_RES_RANGE = 0x0F
_ODR = 0x10
_PWR_MODE_BW = 0x11

_FS = {2: (0b00, 4096), 4: (0b01, 2048), 8: (0b10, 1024), 16: (0b11, 512)}  # FS bits, LSB/g


class MSA301:
    def __init__(self, i2c, addr=_ADDR, g_range=2):
        """g_range: 2, 4, 8 or 16 g full scale (14-bit resolution)."""
        if g_range not in _FS:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        self.i2c = i2c
        self.addr = addr
        pid = self.i2c.readfrom_mem(addr, _PARTID, 1)[0]
        if pid != 0x13:
            raise OSError('MSA301 not found (PARTID 0x%02X, expected 0x13): check wiring' % pid)
        fs, self._lsb_per_g = _FS[g_range]
        # Normal power mode (PWR_MODE = 00), keep the low-power bandwidth bits
        pm = self.i2c.readfrom_mem(addr, _PWR_MODE_BW, 1)[0]
        self._w(_PWR_MODE_BW, pm & 0x3F)
        # All three axes enabled, ODR 0111 = 125 Hz
        self._w(_ODR, 0x07)
        # RESOLUTION = 00 (14 bit), FS as requested
        self._w(_RES_RANGE, fs)
        time.sleep_ms(20)  # wake-up 1 ms from power-down plus a couple of 8 ms samples

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def raw(self):
        """(x, y, z) 14-bit counts from one 6-byte burst starting at ACC_X_LSB (0x02)."""
        d = self.i2c.readfrom_mem(self.addr, _ACC_X_LSB, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # LSB register first, MSB register second
            if v & 0x8000:
                v -= 65536
            out.append(v >> 2)  # 14-bit value sits in bits 15:2
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._lsb_per_g
        x, y, z = self.raw()
        return x / k, y / k, z / k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
