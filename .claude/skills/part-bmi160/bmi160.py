# BMI160 6-axis IMU (Bosch Sensortec BMI160), MicroPython I2C driver.
# Written from the datasheet BST-BMI160-DS000-09: chip id 0xD1 in register 0x00,
# CMD register 0x7E (softreset 0xB6, accel normal 0x11, gyro normal 0x15),
# data registers 0x0C-0x17 (gyro X,Y,Z then accel X,Y,Z, 16-bit two's complement, LSB first),
# temperature 0x20-0x21 (0x0000 = 23 degC, 1/512 K per LSB, valid while the gyro is in normal mode).
import time

_CHIP_ID = 0x00
_DATA_GYR = 0x0C
_TEMP = 0x20
_ACC_RANGE = 0x41
_GYR_RANGE = 0x43
_CMD = 0x7E

# ACC_RANGE code -> LSB per g; GYR_RANGE code -> LSB per deg/s (datasheet tables)
_ACC = {2: (0x03, 16384.0), 4: (0x05, 8192.0), 8: (0x08, 4096.0), 16: (0x0C, 2048.0)}
_GYR = {2000: (0x00, 16.4), 1000: (0x01, 32.8), 500: (0x02, 65.6), 250: (0x03, 131.2), 125: (0x04, 262.4)}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class BMI160:
    def __init__(self, i2c, addr=0x69, accel_range=2, gyro_range=2000):
        # GY-BMI160: SAO is pulled up on the board, so the address is 0x69 unless SAO is tied to GND (0x68).
        self.i2c = i2c
        self.addr = addr
        cid = self._r(_CHIP_ID, 1)[0]
        if cid != 0xD1:
            raise OSError('BMI160 not found (chip id 0x%02X): check wiring and address' % cid)
        self._w(_CMD, 0xB6)      # softreset
        time.sleep_ms(10)
        self._w(_CMD, 0x11)      # accelerometer -> normal mode (max 3.8 ms)
        time.sleep_ms(5)
        self._w(_CMD, 0x15)      # gyroscope -> normal mode (max 80 ms)
        time.sleep_ms(100)
        code, self._acc_lsb = _ACC[accel_range]
        self._w(_ACC_RANGE, code)
        code, self._gyr_lsb = _GYR[gyro_range]
        self._w(_GYR_RANGE, code)
        time.sleep_ms(10)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def read(self):
        """Return ((ax, ay, az) in g, (gx, gy, gz) in deg/s), read in one burst."""
        d = self._r(_DATA_GYR, 12)
        g = tuple(_s16(d[i], d[i + 1]) / self._gyr_lsb for i in (0, 2, 4))
        a = tuple(_s16(d[i], d[i + 1]) / self._acc_lsb for i in (6, 8, 10))
        return a, g

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        """Die temperature in degC."""
        d = self._r(_TEMP, 2)
        return 23 + _s16(d[0], d[1]) / 512
