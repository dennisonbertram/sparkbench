# ISM330DHCX accelerometer + gyroscope (STMicroelectronics DS13012), MicroPython driver.
# Register map from the datasheet: WHO_AM_I 0x0F = 0x6B, CTRL1_XL 0x10, CTRL2_G 0x11, CTRL3_C 0x12,
# CTRL9_XL 0x18, STATUS_REG 0x1E, OUT_TEMP 0x20-0x21, OUTX_L_G 0x22-0x27, OUTX_L_A 0x28-0x2D
# (16-bit two's complement, low byte first). Temperature: 256 LSB/degC, 0 LSB = 25 degC.
import time

_WHO_AM_I = 0x0F
_CTRL1_XL = 0x10
_CTRL2_G = 0x11
_CTRL3_C = 0x12
_CTRL9_XL = 0x18
_STATUS = 0x1E
_OUT_TEMP_L = 0x20
_OUTX_L_G = 0x22
_OUTX_L_A = 0x28

# Full scale -> (FS[1:0]_XL for CTRL1_XL[3:2], sensitivity in g/LSB). Note the coding: 01 = 16 g.
_ACC_FS = {2: (0b00, 0.061e-3), 4: (0b10, 0.122e-3), 8: (0b11, 0.244e-3), 16: (0b01, 0.488e-3)}
# Full scale -> (CTRL2_G[3:0] = FS1_G FS0_G FS_125 FS_4000, sensitivity in dps/LSB).
_GYR_FS = {125: (0b0010, 4.375e-3), 250: (0b0000, 8.75e-3), 500: (0b0100, 17.5e-3),
           1000: (0b1000, 35e-3), 2000: (0b1100, 70e-3), 4000: (0b0001, 140e-3)}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class ISM330DHCX:
    def __init__(self, i2c, addr=0x6A, accel_fs=2, gyro_fs=250):
        """addr: 0x6A with SDO/SA0 low (Adafruit default), 0x6B with DO pulled high / AD0 jumper bridged."""
        self.i2c = i2c
        self.addr = addr
        who = self._r(_WHO_AM_I, 1)[0]
        if who != 0x6B:
            raise OSError('ISM330DHCX not found at 0x%02X (WHO_AM_I=0x%02X)' % (addr, who))
        fa, self._acc_s = _ACC_FS[accel_fs]
        fg, self._gyr_s = _GYR_FS[gyro_fs]
        # CTRL9_XL: keep DEN_X/Y/Z defaults (0xE0) and set DEVICE_CONF (bit 1) as the datasheet
        # recommends; bit 0 must stay 0.
        self._w(_CTRL9_XL, 0xE2)
        # BDU=1 (MSB and LSB from the same sample), IF_INC=1 (auto-increment for burst reads).
        self._w(_CTRL3_C, 0x44)
        # ODR_XL = 0100 (104 Hz), chosen full scale, LPF2 off.
        self._w(_CTRL1_XL, 0x40 | (fa << 2))
        # ODR_G = 0100 (104 Hz), chosen full scale (FS_G, FS_125, FS_4000).
        self._w(_CTRL2_G, 0x40 | fg)
        time.sleep_ms(100)  # turn-on time 35 ms typ., then the first samples arrive

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _xyz(self, reg, scale):
        d = self._r(reg, 6)
        return (_s16(d[0], d[1]) * scale, _s16(d[2], d[3]) * scale, _s16(d[4], d[5]) * scale)

    def data_ready(self):
        """(accel, gyro, temperature) new-data flags from STATUS_REG."""
        s = self._r(_STATUS, 1)[0]
        return bool(s & 1), bool(s & 2), bool(s & 4)

    def acceleration(self):
        """(x, y, z) in g."""
        return self._xyz(_OUTX_L_A, self._acc_s)

    def gyro(self):
        """(x, y, z) angular rate in degrees per second."""
        return self._xyz(_OUTX_L_G, self._gyr_s)

    def temperature(self):
        """Die temperature in degC (offset up to +/-15 degC: not an air thermometer)."""
        d = self._r(_OUT_TEMP_L, 2)
        return 25 + _s16(d[0], d[1]) / 256
