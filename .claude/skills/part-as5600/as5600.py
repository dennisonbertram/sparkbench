# AS5600 12-bit magnetic rotary position sensor (ams AS5600 datasheet v1-06), MicroPython driver.
# I2C address 0x36. Output registers are 12-bit, high nibble first:
#   RAW ANGLE 0x0C/0x0D (unscaled), ANGLE 0x0E/0x0F (scaled by ZPOS/MPOS/MANG; equal to the raw
#   angle over the full turn on an unprogrammed chip). Degrees = count * 360 / 4096.
# STATUS 0x0B: MD (bit 5) magnet detected, ML (bit 4) magnet too weak, MH (bit 3) magnet too strong.
# AGC 0x1A (0-255 in 5 V mode, 0-128 in 3.3 V mode), MAGNITUDE 0x1B/0x1C (12-bit CORDIC magnitude).
# This driver only reads; it never touches the one-time-programmable BURN register (0xFF).
import time

_REG_ZMCO = 0x00
_REG_ZPOS = 0x01
_REG_MPOS = 0x03
_REG_MANG = 0x05
_REG_CONF = 0x07
_REG_STATUS = 0x0B
_REG_RAW_ANGLE = 0x0C
_REG_ANGLE = 0x0E
_REG_AGC = 0x1A
_REG_MAGNITUDE = 0x1B

_MD = 0x20
_ML = 0x10
_MH = 0x08

COUNTS_PER_TURN = 4096


class AS5600:
    def __init__(self, i2c, addr=0x36):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(10)  # power-up time T_PU is 10 ms max

    def _read12(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return ((d[0] & 0x0F) << 8) | d[1]

    def status(self):
        """Return (magnet_detected, too_weak, too_strong) from the STATUS register."""
        s = self.i2c.readfrom_mem(self.addr, _REG_STATUS, 1)[0]
        return bool(s & _MD), bool(s & _ML), bool(s & _MH)

    def magnet_detected(self):
        return self.status()[0]

    def raw_angle(self):
        """Unscaled angle, 0-4095 counts per turn (RAW ANGLE register)."""
        return self._read12(_REG_RAW_ANGLE)

    def angle_counts(self):
        """Scaled angle, 0-4095 (ANGLE register, uses the programmed ZPOS/MPOS/MANG range)."""
        return self._read12(_REG_ANGLE)

    def raw_degrees(self):
        return self.raw_angle() * 360 / COUNTS_PER_TURN

    def degrees(self):
        """Angle in degrees from the ANGLE register (0 to 359.9 on an unprogrammed chip)."""
        return self.angle_counts() * 360 / COUNTS_PER_TURN

    def agc(self):
        """Automatic gain control value; aim for mid-range (about 64 in 3.3 V mode, 128 in 5 V mode)."""
        return self.i2c.readfrom_mem(self.addr, _REG_AGC, 1)[0]

    def magnitude(self):
        return self._read12(_REG_MAGNITUDE)

    def conf(self):
        """16-bit CONF register (0x07/0x08): PM, HYST, OUTS, PWMF, SF, FTH, WD fields."""
        d = self.i2c.readfrom_mem(self.addr, _REG_CONF, 2)
        return ((d[0] & 0x3F) << 8) | d[1]

    def set_conf(self, value):
        """Write CONF (volatile, lost at power-off). Read-modify-write as the datasheet asks."""
        d = self.i2c.readfrom_mem(self.addr, _REG_CONF, 2)
        hi = (d[0] & 0xC0) | ((value >> 8) & 0x3F)
        self.i2c.writeto_mem(self.addr, _REG_CONF, bytes([hi, value & 0xFF]))

    def burn_count(self):
        """ZMCO: how many times ZPOS/MPOS have been permanently burned (max 3)."""
        return self.i2c.readfrom_mem(self.addr, _REG_ZMCO, 1)[0] & 0x03
