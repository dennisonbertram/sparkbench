# LSM9DS1 9-axis IMU (STMicroelectronics, DocID025715 Rev 2), MicroPython driver.
# Two I2C chips in one package:
#   accelerometer + gyroscope at 0x6B (SDO_AG high; 0x6A with SDO_AG low), WHO_AM_I 0x0F = 0x68
#   magnetometer at 0x1E (SDO_M high; 0x1C with SDO_M low), WHO_AM_I_M 0x0F = 0x3D
# Outputs are 16-bit two's complement, low byte first (BLE = 0, the default).
# Accel/gyro: the register address auto-increments while CTRL_REG8.IF_ADD_INC = 1 (default).
# Magnetometer: the MSB of the register address must be set to auto-increment (datasheet 5.1.1).
import time

AG_ADDR = 0x6B
MAG_ADDR = 0x1E

_WHO_AM_I = 0x0F        # 0x68 (accel/gyro), 0x3D (magnetometer)
_CTRL_REG1_G = 0x10     # ODR_G[2:0] FS_G[1:0] 0 BW_G[1:0]
_OUT_TEMP_L = 0x15
_STATUS_REG = 0x17      # bit0 XLDA, bit1 GDA, bit2 TDA
_OUT_X_L_G = 0x18
_CTRL_REG6_XL = 0x20    # ODR_XL[2:0] FS_XL[1:0] BW_SCAL_ODR BW_XL[1:0]
_CTRL_REG8 = 0x22       # BOOT BDU H_LACTIVE PP_OD SIM IF_ADD_INC BLE SW_RESET
_OUT_X_L_XL = 0x28
_CTRL_REG1_M = 0x20
_CTRL_REG2_M = 0x21
_CTRL_REG3_M = 0x22
_CTRL_REG4_M = 0x23
_CTRL_REG5_M = 0x24
_STATUS_REG_M = 0x27    # bit3 ZYXDA
_OUT_X_L_M = 0x28

# Full scale -> (register bits, sensitivity), datasheet Table 3 and register descriptions.
# FS_XL coding: 00 = 2 g, 01 = 16 g, 10 = 4 g, 11 = 8 g.
_ACC_FS = {2: (0b00, 0.061e-3), 4: (0b10, 0.122e-3), 8: (0b11, 0.244e-3), 16: (0b01, 0.732e-3)}   # g/LSB
_GYR_FS = {245: (0b00, 8.75e-3), 500: (0b01, 17.5e-3), 2000: (0b11, 70e-3)}                     # dps/LSB
_MAG_FS = {4: (0b00, 0.14e-3), 8: (0b01, 0.29e-3), 12: (0b10, 0.43e-3), 16: (0b11, 0.58e-3)}    # gauss/LSB


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class LSM9DS1:
    def __init__(self, i2c, ag_addr=AG_ADDR, mag_addr=MAG_ADDR, accel_fs=2, gyro_fs=245, mag_fs=4):
        self.i2c = i2c
        self.ag = ag_addr
        self.mag = mag_addr
        who = self._r(self.ag, _WHO_AM_I, 1)[0]
        if who != 0x68:
            raise OSError('LSM9DS1 accel/gyro not found at 0x%02X (WHO_AM_I=0x%02X)' % (self.ag, who))
        who = self._r(self.mag, _WHO_AM_I, 1)[0]
        if who != 0x3D:
            raise OSError('LSM9DS1 magnetometer not found at 0x%02X (WHO_AM_I=0x%02X)' % (self.mag, who))
        fa, self._acc_s = _ACC_FS[accel_fs]
        fg, self._gyr_s = _GYR_FS[gyro_fs]
        fm, self._mag_s = _MAG_FS[mag_fs]
        # BDU = 1 (LSB and MSB from the same sample), IF_ADD_INC = 1 (burst reads).
        self._w(self.ag, _CTRL_REG8, 0x44)
        # Gyro (and accel, which then shares its rate): ODR 119 Hz (011), chosen full scale, BW 00.
        self._w(self.ag, _CTRL_REG1_G, 0x60 | (fg << 3))
        # Accelerometer: ODR 119 Hz (011), chosen full scale, bandwidth set by ODR.
        self._w(self.ag, _CTRL_REG6_XL, 0x60 | (fa << 3))
        # Magnetometer: temperature compensation on, X/Y ultra-high performance (OM = 11), 10 Hz (DO = 100).
        self._w(self.mag, _CTRL_REG1_M, 0xF0)
        self._w(self.mag, _CTRL_REG2_M, fm << 5)
        # Z axis ultra-high performance (OMZ = 11), little endian.
        self._w(self.mag, _CTRL_REG4_M, 0x0C)
        # BDU = 1.
        self._w(self.mag, _CTRL_REG5_M, 0x40)
        # Continuous-conversion mode (MD = 00); the chip starts in power-down (MD = 11).
        self._w(self.mag, _CTRL_REG3_M, 0x00)
        time.sleep_ms(100)  # gyro turn-on and the first magnetometer sample (10 Hz)

    def _r(self, addr, reg, n):
        return self.i2c.readfrom_mem(addr, reg, n)

    def _w(self, addr, reg, val):
        self.i2c.writeto_mem(addr, reg, bytes([val]))

    @staticmethod
    def _xyz(d, scale):
        return (_s16(d[0], d[1]) * scale, _s16(d[2], d[3]) * scale, _s16(d[4], d[5]) * scale)

    def data_ready(self):
        """(accel, gyro, temperature, magnetometer) new-data flags."""
        s = self._r(self.ag, _STATUS_REG, 1)[0]
        m = self._r(self.mag, _STATUS_REG_M, 1)[0]
        return bool(s & 1), bool(s & 2), bool(s & 4), bool(m & 8)

    def acceleration(self):
        """(x, y, z) in g."""
        return self._xyz(self._r(self.ag, _OUT_X_L_XL, 6), self._acc_s)

    def gyro(self):
        """(x, y, z) angular rate in degrees per second."""
        return self._xyz(self._r(self.ag, _OUT_X_L_G, 6), self._gyr_s)

    def magnetic(self):
        """(x, y, z) magnetic field in gauss (1 gauss = 100 uT)."""
        # Set bit 7 of the register address: the magnetometer only auto-increments when asked.
        return self._xyz(self._r(self.mag, _OUT_X_L_M | 0x80, 6), self._mag_s)

    def temperature(self):
        """Die temperature in degC: 16 LSB/degC, 0 at 25 degC (not an air thermometer)."""
        d = self._r(self.ag, _OUT_TEMP_L, 2)
        return 25 + _s16(d[0], d[1]) / 16
