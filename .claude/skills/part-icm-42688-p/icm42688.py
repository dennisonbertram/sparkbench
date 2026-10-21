# ICM-42688-P 6-axis IMU (TDK InvenSense), MicroPython I2C driver.
# Written from the TDK datasheet DS-000347:
#   WHO_AM_I 0x75 = 0x47, REG_BANK_SEL 0x76 (bank 0 holds everything used here)
#   DEVICE_CONFIG 0x11 bit0 = soft reset (wait 1 ms before any other access)
#   PWR_MGMT0 0x4E: GYRO_MODE bits 3:2, ACCEL_MODE bits 1:0 (11 = low-noise mode); the chip powers up asleep
#   GYRO_CONFIG0 0x4F: GYRO_FS_SEL bits 7:5 (000 = +-2000 dps ... 010 = +-500 dps), GYRO_ODR bits 3:0
#   ACCEL_CONFIG0 0x50: ACCEL_FS_SEL bits 7:5 (000 = +-16 g ... 011 = +-2 g), ACCEL_ODR bits 3:0
#   TEMP_DATA 0x1D-0x1E, ACCEL_DATA X/Y/Z 0x1F-0x24, GYRO_DATA X/Y/Z 0x25-0x2A:
#   16-bit two's complement, high byte first (INTF_CONFIG0 SENSOR_DATA_ENDIAN = 1, the default)
#   Temperature degC = TEMP_DATA / 132.48 + 25
# I2C address: 0x68 with AP_AD0 (board pin SDO) low, 0x69 with it high.
# For I2C the chip's CS pin must be held high (tied to VDDIO).
import time

_DEVICE_CONFIG = 0x11
_TEMP_DATA1 = 0x1D
_PWR_MGMT0 = 0x4E
_GYRO_CONFIG0 = 0x4F
_ACCEL_CONFIG0 = 0x50
_WHO_AM_I = 0x75
_REG_BANK_SEL = 0x76

# full scale -> (FS_SEL code, LSB per unit), datasheet sections 3.1, 3.2, 14.37, 14.38
_ACC = {16: (0, 2048.0), 8: (1, 4096.0), 4: (2, 8192.0), 2: (3, 16384.0)}
_GYR = {2000: (0, 16.4), 1000: (1, 32.8), 500: (2, 65.5), 250: (3, 131.0),
        125: (4, 262.0), 62.5: (5, 524.3), 31.25: (6, 1048.6), 15.625: (7, 2097.2)}
_ODR_100HZ = 0x08  # ODR code 1000 = 100 Hz (valid in low-noise mode for both sensors)


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class ICM42688:
    def __init__(self, i2c, addr=None, accel_range=4, gyro_range=500):
        """addr=None tries 0x68 (SDO to GND) then 0x69 (SDO to 3.3 V)."""
        self.i2c = i2c
        self.addr = None
        for a in ((addr,) if addr is not None else (0x68, 0x69)):
            try:
                if i2c.readfrom_mem(a, _WHO_AM_I, 1)[0] == 0x47:
                    self.addr = a
                    break
            except OSError:
                pass
        if self.addr is None:
            raise OSError('ICM-42688-P not found (WHO_AM_I 0x47 at 0x68/0x69): check wiring, CS high, SDO tied')
        self._w(_REG_BANK_SEL, 0)
        # Soft reset, then wait (datasheet: 1 ms before any other register access).
        try:
            self._w(_DEVICE_CONFIG, 0x01)
        except OSError:
            pass
        time.sleep_ms(2)
        if self._r(_WHO_AM_I, 1)[0] != 0x47:
            raise OSError('ICM-42688-P did not come back after soft reset')
        self._w(_REG_BANK_SEL, 0)
        code, self._acc_lsb = _ACC[accel_range]
        self._w(_ACCEL_CONFIG0, (code << 5) | _ODR_100HZ)
        code, self._gyr_lsb = _GYR[gyro_range]
        self._w(_GYRO_CONFIG0, (code << 5) | _ODR_100HZ)
        # Gyro + accel in low-noise mode, temperature sensor on.
        self._w(_PWR_MGMT0, 0x0F)
        # No register writes for 200 us after leaving OFF; gyro start-up 30 ms, accel 10 ms,
        # plus one 10 ms sample period before the data registers hold a valid sample.
        time.sleep_ms(50)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def read(self):
        """Return ((ax, ay, az) in g, (gx, gy, gz) in deg/s, temperature in degC) from one 14-byte burst."""
        d = self._r(_TEMP_DATA1, 14)
        t = _s16(d[0], d[1]) / 132.48 + 25
        a = tuple(_s16(d[i], d[i + 1]) / self._acc_lsb for i in (2, 4, 6))
        g = tuple(_s16(d[i], d[i + 1]) / self._gyr_lsb for i in (8, 10, 12))
        return a, g, t

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        """Die temperature in degC (TEMP_DATA / 132.48 + 25)."""
        d = self._r(_TEMP_DATA1, 2)
        return _s16(d[0], d[1]) / 132.48 + 25

    def sleep(self):
        """Turn accel and gyro off (keep the gyro on at least 45 ms before this)."""
        self._w(_PWR_MGMT0, 0x00)
