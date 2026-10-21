# ICM-20948 9-axis IMU (TDK InvenSense DS-000189 v1.3), MicroPython driver.
# Accelerometer, gyroscope and temperature from user bank 0; the AK09916 magnetometer is read
# through the interface bypass (INT_PIN_CFG.BYPASS_EN) at I2C address 0x0C.
import time

_REG_BANK_SEL = 0x7F   # all banks: USER_BANK[1:0] in bits 5:4
# User bank 0
_WHO_AM_I = 0x00       # reads 0xEA
_USER_CTRL = 0x03
_PWR_MGMT_1 = 0x06     # reset value 0x41 (asleep)
_PWR_MGMT_2 = 0x07
_INT_PIN_CFG = 0x0F
_ACCEL_XOUT_H = 0x2D   # 0x2D..0x3A: accel X/Y/Z, gyro X/Y/Z, temperature (big-endian words)
# User bank 2
_GYRO_CONFIG_1 = 0x01
_ACCEL_CONFIG = 0x14

_ACCEL_LSB_PER_G = (16384, 8192, 4096, 2048)        # ACCEL_FS_SEL 0..3 = ±2/4/8/16 g
_GYRO_LSB_PER_DPS = (131.0, 65.5, 32.8, 16.4)       # GYRO_FS_SEL 0..3 = ±250/500/1000/2000 dps
_TEMP_SENSITIVITY = 333.87                          # LSB/°C, room-temperature offset 0 LSB at 21 °C

_MAG_ADDR = 0x0C       # AK09916
_MAG_WIA2 = 0x01       # reads 0x09
_MAG_ST1 = 0x10
_MAG_HXL = 0x11
_MAG_CNTL2 = 0x31
_MAG_CNTL3 = 0x32
_MAG_UT_PER_LSB = 0.15


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class ICM20948:
    def __init__(self, i2c, addr=0x69, accel_fs=0, gyro_fs=0):
        """addr 0x69 with SDO/AD0 high (Adafruit default), 0x68 with it low.
        accel_fs 0..3 = ±2/4/8/16 g, gyro_fs 0..3 = ±250/500/1000/2000 dps."""
        self.i2c = i2c
        self.addr = addr
        self._bank(0)
        who = self._r8(_WHO_AM_I)
        if who != 0xEA:
            raise OSError('ICM-20948 not found (WHO_AM_I=0x%02X): check wiring and address' % who)
        self._w8(_PWR_MGMT_1, 0x80)   # DEVICE_RESET (auto-clears); registers back to defaults
        time.sleep_ms(100)            # register access start-up time up to 100 ms
        self._bank(0)
        self._w8(_PWR_MGMT_1, 0x01)   # wake (SLEEP=0), CLKSEL=1: PLL when ready
        time.sleep_ms(40)             # gyro start-up 35 ms
        self._w8(_PWR_MGMT_2, 0x00)   # accelerometer and gyroscope axes all on
        self._bank(2)
        self._w8(_GYRO_CONFIG_1, ((gyro_fs & 3) << 1) | 0x01)   # DLPF on (GYRO_FCHOICE=1)
        self._w8(_ACCEL_CONFIG, ((accel_fs & 3) << 1) | 0x01)   # DLPF on (ACCEL_FCHOICE=1)
        self._bank(0)
        self._a_lsb = _ACCEL_LSB_PER_G[accel_fs & 3]
        self._g_lsb = _GYRO_LSB_PER_DPS[gyro_fs & 3]
        self._mag_ready = False

    def _bank(self, n):
        self._w8(_REG_BANK_SEL, (n & 3) << 4)

    def _w8(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([v]))

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def read(self):
        """Return ((ax, ay, az) in g, (gx, gy, gz) in °/s, temperature in °C)."""
        d = self.i2c.readfrom_mem(self.addr, _ACCEL_XOUT_H, 14)
        w = [_s16(d[i], d[i + 1]) for i in range(0, 14, 2)]
        a = (w[0] / self._a_lsb, w[1] / self._a_lsb, w[2] / self._a_lsb)
        g = (w[3] / self._g_lsb, w[4] / self._g_lsb, w[5] / self._g_lsb)
        t = w[6] / _TEMP_SENSITIVITY + 21
        return a, g, t

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        return self.read()[2]

    def _mag_init(self):
        self._w8(_USER_CTRL, self._r8(_USER_CTRL) & ~0x20)        # I2C_MST_EN = 0
        self._w8(_INT_PIN_CFG, self._r8(_INT_PIN_CFG) | 0x02)     # BYPASS_EN = 1
        if self.i2c.readfrom_mem(_MAG_ADDR, _MAG_WIA2, 1)[0] != 0x09:
            raise OSError('AK09916 magnetometer not found at 0x0C')
        self.i2c.writeto_mem(_MAG_ADDR, _MAG_CNTL3, b'\x01')      # soft reset
        time.sleep_ms(10)
        self.i2c.writeto_mem(_MAG_ADDR, _MAG_CNTL2, b'\x08')      # continuous mode 4 (100 Hz)
        time.sleep_ms(20)
        self._mag_ready = True

    def magnetic(self):
        """Return (mx, my, mz) in µT from the AK09916 (axes as in the datasheet's magnetometer frame)."""
        if not self._mag_ready:
            self._mag_init()
        for _ in range(50):
            if self.i2c.readfrom_mem(_MAG_ADDR, _MAG_ST1, 1)[0] & 0x01:   # DRDY
                break
            time.sleep_ms(2)
        # HXL..HZH, TMPS, ST2: ST2 must be read last to end the read in continuous mode.
        d = self.i2c.readfrom_mem(_MAG_ADDR, _MAG_HXL, 8)
        if d[7] & 0x08:
            raise OSError('AK09916 magnetic sensor overflow (HOFL)')
        return tuple(_s16(d[i + 1], d[i]) * _MAG_UT_PER_LSB for i in (0, 2, 4))
