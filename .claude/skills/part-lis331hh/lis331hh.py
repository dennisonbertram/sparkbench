# LIS331HH high-g 3-axis accelerometer (STMicroelectronics), MicroPython driver for I2C.
# From the LIS331HH datasheet (Doc ID 16366):
#   I2C address 0011000b (0x18) with SDO/SA0 low, 0x19 with SA0 high.
#   WHO_AM_I 0x0F = 0x32 (also checked by Adafruit's LIS331 libraries).
#   CTRL_REG1 0x20: PM[7:5] (000 power-down, 001 normal), DR[4:3] (00 50 Hz, 01 100 Hz,
#     10 400 Hz, 11 1000 Hz), Zen/Yen/Xen bits 2:0. Default 0x07 = power-down.
#   CTRL_REG4 0x23: BDU bit 7, BLE bit 6 (0 = LSB at lower address), FS[5:4]
#     (00 +-6 g, 01 +-12 g, 11 +-24 g).
#   STATUS_REG 0x27: ZYXDA bit 3 = new X/Y/Z set available.
#   OUT_X_L..OUT_Z_H 0x28-0x2D: two's complement, low byte first, 12-bit representation
#     left-justified in 16 bits. Sensitivity 3 / 6 / 12 mg per digit at +-6/12/24 g.
#   I2C sub-address MSB = 1 enables auto-increment for multi-byte reads.
#   Turn-on time 1/ODR + 1 ms.
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x20
_CTRL_REG4 = 0x23
_STATUS_REG = 0x27
_OUT_X_L = 0x28
_AUTO_INC = 0x80

_FS = {6: (0b00, 3), 12: (0b01, 6), 24: (0b11, 12)}  # FS bits, mg/digit (12-bit)


class LIS331HH:
    def __init__(self, i2c, addr=0x18, g_range=6):
        """addr: 0x18 with SDO low or open (Adafruit board), 0x19 with SDO tied to 3.3 V.
        g_range: 6, 12 or 24 g full scale."""
        if g_range not in _FS:
            raise ValueError('g_range must be 6, 12 or 24')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x32:
            raise OSError('LIS331HH not found (WHO_AM_I 0x%02X, expected 0x32): check wiring' % who)
        fs, self._mg_per_digit = _FS[g_range]
        # BDU = 1 (high/low bytes from the same sample), BLE = 0 (little endian), full scale
        self._w(_CTRL_REG4, 0x80 | (fs << 4))
        # Normal mode (PM = 001), 100 Hz (DR = 01), X/Y/Z enabled
        self._w(_CTRL_REG1, 0x2F)
        time.sleep_ms(15)  # turn-on time 1/ODR + 1 ms = 11 ms at 100 Hz

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when STATUS_REG ZYXDA says a new X/Y/Z set is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS_REG, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) 12-bit counts, from one 6-byte auto-increment burst at OUT_X_L."""
        for _ in range(25):  # wait up to ~25 ms (over two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_L | _AUTO_INC, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # OUT_x_L = low byte, OUT_x_H = high byte
            if v & 0x8000:
                v -= 65536
            out.append(v >> 4)  # 12-bit value is left-justified in bits 15:4
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._mg_per_digit / 1000
        x, y, z = self.raw()
        return x * k, y * k, z * k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
