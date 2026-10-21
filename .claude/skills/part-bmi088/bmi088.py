# BMI088 6-axis IMU (Bosch Sensortec BMI088), MicroPython I2C driver.
# Written from the datasheet BST-BMI088-DS001 (rev 1.9). The package holds two chips with
# their own I2C addresses and register maps:
#   accelerometer 0x18 (SDO1 low) / 0x19 (SDO1 high): ACC_CHIP_ID 0x00 = 0x1E, data 0x12-0x17,
#     temperature 0x22-0x23, ACC_RANGE 0x41, ACC_PWR_CONF 0x7C, ACC_PWR_CTRL 0x7D.
#     After power-up it is in SUSPEND mode and must be switched on (ACC_PWR_CONF = 0x00, ACC_PWR_CTRL = 0x04).
#   gyroscope 0x68 (SDO2 low) / 0x69 (SDO2 high): GYRO_CHIP_ID 0x00 = 0x0F, data 0x02-0x07,
#     GYRO_RANGE 0x0F. It starts in normal mode.
# All axis data is 16-bit two's complement, LSB first.
import time

_ACC_CHIP_ID = 0x00
_ACC_DATA = 0x12
_ACC_TEMP = 0x22
_ACC_CONF = 0x40
_ACC_RANGE = 0x41
_ACC_PWR_CONF = 0x7C
_ACC_PWR_CTRL = 0x7D

_GYR_CHIP_ID = 0x00
_GYR_DATA = 0x02
_GYR_RANGE = 0x0F
_GYR_LPM1 = 0x11

# ACC_RANGE code: full scale = 1.5 * 2^(code+1) g  ->  3, 6, 12, 24 g
_ACC = {3: 0x00, 6: 0x01, 12: 0x02, 24: 0x03}
# GYRO_RANGE code -> LSB per deg/s (datasheet table 5.5.5)
_GYR = {2000: (0x00, 16.384), 1000: (0x01, 32.768), 500: (0x02, 65.536), 250: (0x03, 131.072), 125: (0x04, 262.144)}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class BMI088:
    def __init__(self, i2c, acc_addr=0x19, gyro_addr=0x69, accel_range=6, gyro_range=2000):
        # Seeed Grove BMI088: AD0/AD1 pads default to 0x19 (accel) and 0x69 (gyro).
        self.i2c = i2c
        self.acc = acc_addr
        self.gyr = gyro_addr
        time.sleep_ms(2)  # accelerometer boot time after power-up: up to 1 ms
        cid = self._r(self.acc, _ACC_CHIP_ID, 1)[0]
        if cid != 0x1E:
            raise OSError('BMI088 accelerometer not found at 0x%02X (id 0x%02X)' % (acc_addr, cid))
        cid = self._r(self.gyr, _GYR_CHIP_ID, 1)[0]
        if cid != 0x0F:
            raise OSError('BMI088 gyroscope not found at 0x%02X (id 0x%02X)' % (gyro_addr, cid))
        # Accelerometer: leave suspend mode, then switch it (and the temperature sensor) on.
        # Writes in suspend mode need >= 1000 us between them; then wait 450 us after enabling.
        self._w(self.acc, _ACC_PWR_CONF, 0x00)
        time.sleep_ms(2)
        self._w(self.acc, _ACC_PWR_CTRL, 0x04)
        time.sleep_ms(2)
        code = _ACC[accel_range]
        self._w(self.acc, _ACC_RANGE, code)
        self._acc_g_per_lsb = 1.5 * (1 << (code + 1)) / 32768
        # Gyroscope: make sure it is in normal mode (0x00 in GYRO_LPM1) and set the range.
        self._w(self.gyr, _GYR_LPM1, 0x00)
        time.sleep_ms(30)  # up to 30 ms after a power-mode change
        code, self._gyr_lsb = _GYR[gyro_range]
        self._w(self.gyr, _GYR_RANGE, code)
        time.sleep_ms(10)

    def _w(self, addr, reg, val):
        self.i2c.writeto_mem(addr, reg, bytes([val]))

    def _r(self, addr, reg, n):
        return self.i2c.readfrom_mem(addr, reg, n)

    def acceleration(self):
        """(ax, ay, az) in g, read in one burst."""
        d = self._r(self.acc, _ACC_DATA, 6)
        k = self._acc_g_per_lsb
        return tuple(_s16(d[i], d[i + 1]) * k for i in (0, 2, 4))

    def gyro(self):
        """(gx, gy, gz) in deg/s, read in one burst."""
        d = self._r(self.gyr, _GYR_DATA, 6)
        return tuple(_s16(d[i], d[i + 1]) / self._gyr_lsb for i in (0, 2, 4))

    def temperature(self):
        """Die temperature in degC (11-bit, 0.125 degC/LSB, updated every 1.28 s)."""
        d = self._r(self.acc, _ACC_TEMP, 2)
        t = d[0] * 8 + (d[1] >> 5)
        if t > 1023:
            t -= 2048
        return t * 0.125 + 23

    def read(self):
        return self.acceleration(), self.gyro()
