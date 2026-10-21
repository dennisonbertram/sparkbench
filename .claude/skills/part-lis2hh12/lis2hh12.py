# LIS2HH12 3-axis accelerometer (STMicroelectronics), MicroPython driver for I2C.
# From the LIS2HH12 datasheet (DocID025344 Rev 5):
#   I2C address 00111xx: 0x1D with SDO/SA0 tied to Vdd_IO, 0x1E with SDO/SA0 tied to GND.
#   CS must be tied high (Vdd_IO) for I2C. SDA/SCL need external pull-ups to Vdd_IO.
#   WHO_AM_I 0x0F = 0x41. Boot time 20 ms after power-up.
#   CTRL1 0x20: HR bit 7, ODR[2:0] bits 6:4 (011 = 100 Hz), BDU bit 3, Z/Y/X enable bits 2:0.
#     Powers up as 0x07 = power-down.
#   CTRL4 0x23: BW[2:1] bits 7:6, FS[1:0] bits 5:4 (00 +-2 g, 10 +-4 g, 11 +-8 g),
#     BW_SCALE_ODR bit 3, IF_ADD_INC bit 2 (register address auto-increment, default 1).
#   STATUS 0x27: ZYXDA bit 3 = new X/Y/Z data.
#   OUT_X_L..OUT_Z_H 0x28-0x2D: 16-bit two's complement, low byte first.
#   Sensitivity 0.061 / 0.122 / 0.244 mg/digit at +-2 / 4 / 8 g (Table 3).
#   Turn-on: discard 1 sample after leaving power-down.
import time

_WHO_AM_I = 0x0F
_CTRL1 = 0x20
_CTRL4 = 0x23
_CTRL5 = 0x24
_STATUS = 0x27
_OUT_X_L = 0x28

_FS = {2: (0b00, 0.061), 4: (0b10, 0.122), 8: (0b11, 0.244)}  # FS bits, mg/digit


class LIS2HH12:
    def __init__(self, i2c, addr=0x1D, g_range=2):
        """addr: 0x1D with SDO/SA0 tied high (Vdd_IO), 0x1E with SDO/SA0 tied to GND.
        g_range: 2, 4 or 8 g full scale."""
        if g_range not in _FS:
            raise ValueError('g_range must be 2, 4 or 8')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(20)  # boot time (Tboot) after power-up
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x41:
            raise OSError('LIS2HH12 not found (WHO_AM_I 0x%02X, expected 0x41): check wiring, CS high and address' % who)
        fs, self._mg_per_digit = _FS[g_range]
        # FS, IF_ADD_INC = 1 (auto-increment for the 6-byte burst), BW_SCALE_ODR = 0, I2C enabled
        self._w(_CTRL4, (fs << 4) | 0x04)
        # HR = 1, ODR = 100 Hz (011), BDU = 1, X/Y/Z enabled
        self._w(_CTRL1, 0x80 | (0b011 << 4) | 0x08 | 0x07)
        time.sleep_ms(30)  # turn-on: the first sample after power-down is discarded (10 ms per sample at 100 Hz)
        self.i2c.readfrom_mem(addr, _OUT_X_L, 6)  # drop the first sample

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when STATUS ZYXDA says a new X/Y/Z set is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) 16-bit counts from one 6-byte burst at OUT_X_L."""
        for _ in range(20):  # wait up to ~20 ms (two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_L, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # OUT_x_L = low byte, OUT_x_H = high byte
            if v & 0x8000:
                v -= 65536
            out.append(v)
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._mg_per_digit / 1000
        x, y, z = self.raw()
        return x * k, y * k, z * k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())

    def soft_reset(self):
        """CTRL5 SOFT_RESET: acts as a power-on reset, then clears itself."""
        self._w(_CTRL5, 0x40)
        time.sleep_ms(20)
