# BNO055 9-DOF absolute orientation sensor (Bosch Sensortec), MicroPython driver.
# Follows the BNO055 datasheet (BST-BNO055-DS000): CHIP_ID 0xA0 at 0x00, set up in CONFIG mode,
# then switch OPR_MODE (0x3D) to NDOF fusion; Euler angles are signed 16-bit little-endian
# words at 0x1A (heading), 0x1C (roll), 0x1E (pitch), 1 degree = 16 LSB.
# The BNO055 stretches the I2C clock; if reads fail, create the bus with freq=100000.
import time
import struct

_CHIP_ID = 0x00
_PAGE_ID = 0x07
_EUL_HEADING_LSB = 0x1A
_TEMP = 0x34
_CALIB_STAT = 0x35
_SYS_STATUS = 0x39
_UNIT_SEL = 0x3B
_OPR_MODE = 0x3D
_PWR_MODE = 0x3E
_SYS_TRIGGER = 0x3F

CONFIG_MODE = 0x00
IMU_MODE = 0x08
COMPASS_MODE = 0x09
M4G_MODE = 0x0A
NDOF_FMC_OFF_MODE = 0x0B
NDOF_MODE = 0x0C


class BNO055:
    def __init__(self, i2c, addr=0x28, mode=NDOF_MODE):
        self.i2c = i2c
        self.addr = addr
        # After power-on the chip needs up to 650 ms (POR time) before it answers.
        for _ in range(20):
            try:
                if self._r8(_CHIP_ID) == 0xA0:
                    break
            except OSError:
                pass
            time.sleep_ms(50)
        else:
            raise OSError('BNO055 not found (chip id is not 0xA0): check wiring and ADR')
        self.set_mode(CONFIG_MODE)
        self._w8(_PAGE_ID, 0x00)      # register page 0
        self._w8(_PWR_MODE, 0x00)     # normal power mode
        # Android orientation format, degrees, Celsius, dps, m/s^2 (reset value 0x80, set explicitly).
        self._w8(_UNIT_SEL, 0x80)
        self._w8(_SYS_TRIGGER, 0x00)  # internal oscillator
        time.sleep_ms(10)
        self.set_mode(mode)

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def set_mode(self, mode):
        """Select an operating mode (Table 3-5). CONFIG->any takes 7 ms, any->CONFIG 19 ms."""
        self._w8(_OPR_MODE, mode & 0x0F)
        time.sleep_ms(25 if mode == CONFIG_MODE else 20)

    def euler(self):
        """(heading, roll, pitch) in degrees. Only valid in a fusion mode (IMU/COMPASS/M4G/NDOF)."""
        h, r, p = struct.unpack('<hhh', self.i2c.readfrom_mem(self.addr, _EUL_HEADING_LSB, 6))
        return h / 16, r / 16, p / 16

    def temperature(self):
        """Chip temperature in °C (1 °C = 1 LSB, signed)."""
        t = self._r8(_TEMP)
        return t - 256 if t > 127 else t

    def calibration_status(self):
        """(sys, gyro, accel, mag), each 0 (uncalibrated) to 3 (fully calibrated)."""
        c = self._r8(_CALIB_STAT)
        return (c >> 6) & 3, (c >> 4) & 3, (c >> 2) & 3, c & 3

    def system_status(self):
        """SYS_STATUS: 5 = sensor fusion algorithm running."""
        return self._r8(_SYS_STATUS)
