# MicroPython driver for the Bosch BMI323 6-axis IMU (accelerometer + gyroscope) over I2C.
# Written from the BMI323 datasheet (BST-BMI323-DS000):
#  - registers are 16-bit words, sent low byte first; register addresses are 8-bit
#  - every I2C register read returns 2 dummy bytes before the payload (section 4, 7.2.4)
#  - CHIP_ID (0x00) low byte = 0x43; soft reset = write 0xDEAF to CMD (0x7E)
#  - ACC_DATA_X/Y/Z 0x03-0x05, GYR_DATA_X/Y/Z 0x06-0x08, TEMP_DATA 0x09 (T = raw/512 + 23 C)
#  - 0x8000 in a data register means "no valid sample yet"
import time

_CHIP_ID = 0x00
_ERR_REG = 0x01
_STATUS = 0x02
_ACC_DATA_X = 0x03
_ACC_CONF = 0x20
_GYR_CONF = 0x21
_CMD = 0x7E

_CHIP_ID_VALUE = 0x43
_SOFT_RESET = 0xDEAF

# ACC_CONF: acc_mode 0b100 (normal, continuous) <<12, no averaging, BW = ODR/2,
# acc_range 0b010 = +/-8 g (4.10 LSB/mg), acc_odr 0b1000 = 100 Hz  -> 0x4028
_ACC_CONF_VALUE = 0x4028
# GYR_CONF: gyr_mode 0b100 (normal) <<12, no averaging, BW = ODR/2,
# gyr_range 0b100 = +/-2000 dps (16.4 LSB/dps), gyr_odr 0b1000 = 100 Hz -> 0x4048
_GYR_CONF_VALUE = 0x4048

ACC_G_PER_LSB = 8 / 32768        # +/-8 g full scale
GYR_DPS_PER_LSB = 2000 / 32768   # +/-2000 deg/s full scale
_INVALID = -32768                # 0x8000


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


class BMI323:
    def __init__(self, i2c, addr=None):
        self.i2c = i2c
        if addr is None:
            addr = self._find()
        self.addr = addr
        if self.chip_id() != _CHIP_ID_VALUE:
            raise OSError('BMI323 not found at 0x%02X' % addr)
        # Soft reset, then wait for the power-on time (1.5 ms, datasheet table 1).
        self._write(_CMD, _SOFT_RESET)
        time.sleep_ms(2)
        if self.chip_id() != _CHIP_ID_VALUE:
            raise OSError('BMI323 did not come back after soft reset')
        if self._read_words(_ERR_REG, 1)[0] & 0x0001:
            raise OSError('BMI323 fatal error (ERR_REG.fatal_err)')
        self._write(_ACC_CONF, _ACC_CONF_VALUE)
        self._write(_GYR_CONF, _GYR_CONF_VALUE)
        # Gyroscope start-up from suspend is about 30 ms; give both sensors time for a first sample.
        time.sleep_ms(50)

    def _find(self):
        found = self.i2c.scan()
        for a in (0x68, 0x69):
            if a in found:
                return a
        raise OSError('BMI323 not found at 0x68 or 0x69')

    def _read_raw(self, reg, nbytes):
        # 2 dummy bytes come first on I2C; drop them.
        return self.i2c.readfrom_mem(self.addr, reg, nbytes + 2)[2:]

    def _read_words(self, reg, n):
        b = self._read_raw(reg, 2 * n)
        return [b[2 * i] | (b[2 * i + 1] << 8) for i in range(n)]

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes((value & 0xFF, (value >> 8) & 0xFF)))
        # Interface idle time: 450 us while in suspend mode, 2 us otherwise (datasheet 7.3).
        time.sleep_us(500)

    def chip_id(self):
        return self._read_words(_CHIP_ID, 1)[0] & 0xFF

    def status(self):
        """STATUS register (clear-on-read): bit 7 drdy_acc, 6 drdy_gyr, 5 drdy_temp, 0 por_detected."""
        return self._read_words(_STATUS, 1)[0]

    def read_raw(self):
        """Raw words: (ax, ay, az, gx, gy, gz, temp) from one burst read of 0x03-0x09."""
        b = self._read_raw(_ACC_DATA_X, 14)
        return tuple(_s16(b[2 * i], b[2 * i + 1]) for i in range(7))

    def read(self):
        """((ax, ay, az) in g, (gx, gy, gz) in deg/s). None for an axis without a valid sample."""
        r = self.read_raw()
        acc = tuple(None if v == _INVALID else v * ACC_G_PER_LSB for v in r[0:3])
        gyr = tuple(None if v == _INVALID else v * GYR_DPS_PER_LSB for v in r[3:6])
        return acc, gyr

    def temperature(self):
        """Die temperature in C (T = raw/512 + 23), or None if no sample yet."""
        t = self._read_words(0x09, 1)[0]
        if t == 0x8000:
            return None
        if t & 0x8000:
            t -= 0x10000
        return t / 512 + 23
