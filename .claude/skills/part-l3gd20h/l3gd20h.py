# L3GD20H 3-axis gyroscope (STMicroelectronics, DocID023469 Rev 2), MicroPython driver for I2C.
# From the datasheet:
#   WHO_AM_I 0x0F = 0xD7. CTRL1 0x20 (DR[7:6] BW[5:4] PD bit 3, Zen/Yen/Xen bits 2:0; PD = 0 at reset,
#   so the chip starts powered down), CTRL4 0x23 (BDU bit 7, BLE bit 6, FS[5:4]: 00 = 245, 01 = 500,
#   1x = 2000 dps), STATUS 0x27 (ZYXDA bit 3), LOW_ODR 0x39 (Low_ODR bit 0).
#   OUT_X_L..OUT_Z_H 0x28-0x2D: 16-bit two's complement, low byte at the lower address (BLE = 0).
#   Sensitivity 8.75 / 17.50 / 70.00 mdps per digit at +-245 / 500 / 2000 dps.
#   Setting the MSB of the register sub-address (0x28 | 0x80) auto-increments for burst reads.
#   Turn-on time 50 ms after leaving power-down.
import time

_WHO_AM_I = 0x0F
_CTRL1 = 0x20
_CTRL4 = 0x23
_STATUS = 0x27
_OUT_X_L = 0x28
_LOW_ODR = 0x39
_AUTO_INC = 0x80

# Full scale (dps) -> (FS bits for CTRL4[5:4], sensitivity in dps per digit)
_FS = {245: (0b00, 0.00875), 500: (0b01, 0.0175), 2000: (0b10, 0.070)}


class L3GD20H:
    def __init__(self, i2c, addr=0x6B, fs=245):
        """addr: 0x6B with SDO/SA0 high (Adafruit board default, SA0 pulled up), 0x6A with SA0 to GND.
        fs: full scale 245, 500 or 2000 degrees per second."""
        if fs not in _FS:
            raise ValueError('fs must be 245, 500 or 2000')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0xD7:
            # 0xD4 is the older L3GD20 / L3G4200D: similar but not the same chip
            raise OSError('L3GD20H not found (WHO_AM_I 0x%02X, expected 0xD7): check wiring' % who)
        bits, self._dps = _FS[fs]
        self._w(_LOW_ODR, 0x00)                 # Low_ODR = 0, I2C enabled, DRDY active high
        self._w(_CTRL4, 0x80 | (bits << 4))     # BDU = 1, little endian, full scale, normal (no self-test)
        self._w(_CTRL1, 0x0F)                   # DR = 00, BW = 00 -> 100 Hz; PD = 1 normal mode; X, Y, Z on
        time.sleep_ms(60)                       # turn-on time is 50 ms

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when STATUS ZYXDA says a new X/Y/Z set is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) raw 16-bit counts, read in one 6-byte auto-increment burst from OUT_X_L."""
        for _ in range(25):  # wait up to ~25 ms (two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_L | _AUTO_INC, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)
            if v & 0x8000:
                v -= 65536
            out.append(v)
        return tuple(out)

    def read(self):
        """(x, y, z) angular rate in degrees per second."""
        x, y, z = self.raw()
        k = self._dps
        return x * k, y * k, z * k

    def read_rads(self):
        """(x, y, z) angular rate in radians per second."""
        return tuple(v * 0.017453292519943295 for v in self.read())
