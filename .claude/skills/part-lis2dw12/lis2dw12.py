# LIS2DW12 3-axis accelerometer (STMicroelectronics), MicroPython driver for I2C.
# From the LIS2DW12 datasheet (DS11811 Rev 8):
#   I2C address 001100xb: 0x18 with SDO/SA0 low, 0x19 with SDO/SA0 high.
#   WHO_AM_I 0x0F = 0x44.
#   CTRL1 0x20: ODR[7:4], MODE[3:2] (01 = High-Performance, 14-bit), LP_MODE[1:0]; powers up 0x00 = power-down.
#   CTRL2 0x21: BOOT bit 7, SOFT_RESET bit 6, bit 5 must be 0, CS_PU_DISC bit 4, BDU bit 3,
#               IF_ADD_INC bit 2 (default 1: register address auto-increments on multi-byte access), I2C_DISABLE bit 1, SIM bit 0.
#   CTRL6 0x25: BW_FILT[7:6], FS[5:4] (+-2/4/8/16 g), FDS bit 3, LOW_NOISE bit 2.
#   OUT_T 0x26: temperature, 8-bit two's complement, 1 degC/LSB, 0 = 25 degC.
#   STATUS 0x27: DRDY bit 0.
#   OUT_X_L..OUT_Z_H 0x28-0x2D: 16-bit two's complement, low byte first, left-justified
#   (14-bit in High-Performance mode: value >> 2).
#   Sensitivity (Table 3, High-Performance mode): 0.244 / 0.488 / 0.976 / 1.952 mg/digit at +-2/4/8/16 g.
#   Table 13: at 100 Hz in HP mode with ODR/2 bandwidth, discard the first sample after setting the ODR.
import time

_WHO_AM_I = 0x0F
_CTRL1 = 0x20
_CTRL2 = 0x21
_CTRL6 = 0x25
_OUT_T = 0x26
_STATUS = 0x27
_OUT_X_L = 0x28

_FS = {2: (0b00, 0.244), 4: (0b01, 0.488), 8: (0b10, 0.976), 16: (0b11, 1.952)}  # FS bits, mg/digit (14-bit HP)


class LIS2DW12:
    def __init__(self, i2c, addr=0x19, g_range=2):
        """addr: 0x19 with SDO high (DFRobot SEN0405 default, 10 k pull-up on SDO),
        0x18 with the SDO pin tied to GND.
        g_range: 2, 4, 8 or 16 g full scale (High-Performance 14-bit mode)."""
        if g_range not in _FS:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x44:
            raise OSError('LIS2DW12 not found (WHO_AM_I 0x%02X, expected 0x44): check wiring and address' % who)
        fs, self._mg_per_digit = _FS[g_range]
        # Soft reset: restores all control registers; the bit clears itself when done
        self._w(_CTRL2, 0x40)
        for _ in range(10):
            time.sleep_ms(5)
            if not self.i2c.readfrom_mem(addr, _CTRL2, 1)[0] & 0x40:
                break
        # BDU = 1 (MSB/LSB from the same sample), IF_ADD_INC = 1 (burst reads), bit 5 = 0, CS pull-up kept
        self._w(_CTRL2, 0x0C)
        # BW_FILT = ODR/2, FS, low-pass path, LOW_NOISE = 1
        self._w(_CTRL6, (fs << 4) | 0x04)
        # ODR = 100 Hz (0101), MODE = 01 High-Performance (14-bit), LP_MODE = 00
        self._w(_CTRL1, 0x54)
        time.sleep_ms(30)  # Table 13: discard the first sample at 100 Hz (10 ms per sample)
        self.raw()

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when STATUS DRDY says a new X/Y/Z set is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x01)

    def raw(self):
        """(x, y, z) 14-bit counts from one 6-byte burst at OUT_X_L (IF_ADD_INC = 1)."""
        for _ in range(25):  # wait up to ~25 ms (two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_L, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # OUT_x_L = low byte, OUT_x_H = high byte
            if v & 0x8000:
                v -= 65536
            out.append(v >> 2)  # left-justified: the 14-bit value sits in bits 15:2
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._mg_per_digit / 1000
        x, y, z = self.raw()
        return x * k, y * k, z * k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())

    def temperature(self):
        """Die temperature in degC from OUT_T (8-bit, 1 degC/LSB, 0 = 25 degC); rough, not an ambient sensor."""
        t = self.i2c.readfrom_mem(self.addr, _OUT_T, 1)[0]
        if t & 0x80:
            t -= 256
        return 25 + t
