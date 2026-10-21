# LIS2DH12 3-axis accelerometer (STMicroelectronics), MicroPython driver for I2C.
# From the LIS2DH12 datasheet (DocID025056 Rev 6):
#   I2C address 001100xb: 0x18 with SDO/SA0 low, 0x19 with SDO/SA0 high.
#   WHO_AM_I 0x0F = 0x33, CTRL_REG1 0x20 (ODR[7:4], LPen bit 3, Z/Y/X enable bits 2:0; powers up 0x07 = power-down),
#   CTRL_REG4 0x23 (BDU bit 7, BLE bit 6, FS[5:4], HR bit 3), STATUS_REG 0x27 (ZYXDA bit 3),
#   OUT_X_L..OUT_Z_H 0x28-0x2D: two's complement, left-justified, low byte first (BLE = 0).
#   The MSB of the register sub-address (0x28 | 0x80) enables auto-increment for burst reads.
#   High-resolution (12-bit) sensitivity: 1 / 2 / 4 / 12 mg per digit at +-2/4/8/16 g (Table 4).
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x20
_CTRL_REG4 = 0x23
_REFERENCE = 0x26
_STATUS_REG = 0x27
_OUT_X_L = 0x28
_AUTO_INC = 0x80

_FS = {2: (0b00, 1), 4: (0b01, 2), 8: (0b10, 4), 16: (0b11, 12)}  # FS bits, mg/digit (HR mode)


class LIS2DH12:
    def __init__(self, i2c, addr=0x19, g_range=2):
        """addr: 0x19 with SDO/SA0 high (SparkFun Qwiic board default, ADR jumper open),
        0x18 with SDO/SA0 low (ADR jumper closed).
        g_range: 2, 4, 8 or 16 g full scale (high-resolution 12-bit mode)."""
        if g_range not in _FS:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x33:
            raise OSError('LIS2DH12 not found (WHO_AM_I 0x%02X, expected 0x33): check wiring and address' % who)
        fs, self._mg_per_digit = _FS[g_range]
        # Datasheet: read REFERENCE to reset the filter block before (re)entering HR mode
        self.i2c.readfrom_mem(addr, _REFERENCE, 1)
        # BDU = 1 (MSB/LSB from the same sample), BLE = 0, FS, HR = 1 -> 12-bit high-resolution mode
        self._w(_CTRL_REG4, 0x80 | (fs << 4) | 0x08)
        # 100 Hz ODR (0101), LPen = 0 (LPen and HR must not both be 1), X/Y/Z enabled
        self._w(_CTRL_REG1, 0x57)
        time.sleep_ms(80)  # high-resolution turn-on time is 7/ODR = 70 ms at 100 Hz

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when STATUS_REG ZYXDA says a new X/Y/Z set is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS_REG, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) 12-bit counts from one 6-byte auto-increment burst at OUT_X_L."""
        for _ in range(20):  # wait up to ~20 ms (two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_L | _AUTO_INC, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # OUT_x_L = low byte, OUT_x_H = high byte
            if v & 0x8000:
                v -= 65536
            out.append(v >> 4)  # left-justified: the 12-bit value sits in bits 15:4
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._mg_per_digit / 1000
        x, y, z = self.raw()
        return x * k, y * k, z * k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
