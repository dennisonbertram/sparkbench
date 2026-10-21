# ICM-20649 wide-range 6-axis IMU (TDK InvenSense DS-000192 rev 1.0), MicroPython driver.
# Accelerometer (+-4/8/16/30 g), gyroscope (+-500/1000/2000/4000 dps) and temperature,
# read over I2C from user bank 0; full-scale settings live in user bank 2.
import time

_REG_BANK_SEL = 0x7F   # all banks: USER_BANK[1:0] in bits 5:4
# User bank 0
_WHO_AM_I = 0x00       # reads 0xE1
_PWR_MGMT_1 = 0x06     # reset value 0x41 (asleep, CLKSEL=1)
_PWR_MGMT_2 = 0x07
_ACCEL_XOUT_H = 0x2D   # 0x2D..0x3A: accel X/Y/Z, gyro X/Y/Z, temperature (big-endian words)
# User bank 2
_GYRO_CONFIG_1 = 0x01
_ACCEL_CONFIG = 0x14

_ACCEL_LSB_PER_G = (8192, 4096, 2048, 1024)        # ACCEL_FS_SEL 0..3 = +-4/8/16/30 g
_GYRO_LSB_PER_DPS = (65.5, 32.8, 16.4, 8.2)        # GYRO_FS_SEL 0..3 = +-500/1000/2000/4000 dps
_TEMP_SENSITIVITY = 333.87                         # LSB/degC; room-temperature offset 0 LSB at 21 degC


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class ICM20649:
    def __init__(self, i2c, addr=0x68, accel_fs=0, gyro_fs=0):
        """addr 0x68 with AD0 low (Adafruit default), 0x69 with AD0 high.
        accel_fs 0..3 = +-4/8/16/30 g, gyro_fs 0..3 = +-500/1000/2000/4000 dps."""
        self.i2c = i2c
        self.addr = addr
        self._bank(0)
        who = self._r8(_WHO_AM_I)
        if who != 0xE1:
            raise OSError('ICM-20649 not found (WHO_AM_I=0x%02X): check wiring and address' % who)
        self._w8(_PWR_MGMT_1, 0x80)   # DEVICE_RESET (auto-clears); registers back to defaults
        time.sleep_ms(100)            # register access start-up time up to 100 ms
        self._bank(0)
        self._w8(_PWR_MGMT_1, 0x01)   # SLEEP=0, LP_EN=0, CLKSEL=1 (PLL when ready)
        time.sleep_ms(40)             # gyro start-up from sleep 35 ms
        self._w8(_PWR_MGMT_2, 0x00)   # accelerometer and gyroscope axes all on
        self._bank(2)
        self._w8(_GYRO_CONFIG_1, ((gyro_fs & 3) << 1) | 0x01)   # GYRO_FS_SEL, DLPF on
        self._w8(_ACCEL_CONFIG, ((accel_fs & 3) << 1) | 0x01)   # ACCEL_FS_SEL, DLPF on
        self._bank(0)
        self._a_lsb = _ACCEL_LSB_PER_G[accel_fs & 3]
        self._g_lsb = _GYRO_LSB_PER_DPS[gyro_fs & 3]
        time.sleep_ms(20)

    def _bank(self, n):
        self._w8(_REG_BANK_SEL, (n & 3) << 4)

    def _w8(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([v]))

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def read(self):
        """Return ((ax, ay, az) in g, (gx, gy, gz) in deg/s, temperature in degC)."""
        d = self.i2c.readfrom_mem(self.addr, _ACCEL_XOUT_H, 14)
        w = [_s16(d[i], d[i + 1]) for i in range(0, 14, 2)]
        a = (w[0] / self._a_lsb, w[1] / self._a_lsb, w[2] / self._a_lsb)
        g = (w[3] / self._g_lsb, w[4] / self._g_lsb, w[5] / self._g_lsb)
        t = w[6] / _TEMP_SENSITIVITY + 21   # TEMP_degC = (TEMP_OUT - 0) / 333.87 + 21
        return a, g, t

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        return self.read()[2]
