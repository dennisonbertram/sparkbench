# HMC5883L 3-axis digital compass (Honeywell HMC5883L datasheet), MicroPython driver.
# I2C address 0x1E. Registers: 0x00 CRA, 0x01 CRB (gain), 0x02 mode, 0x03..0x08 data
# in the order X MSB, X LSB, Z MSB, Z LSB, Y MSB, Y LSB (16-bit two's complement, big-endian,
# valid range -2048..2047, -4096 = overflow), 0x09 status (bit 0 RDY), 0x0A..0x0C ID "H43".
# Setup follows the datasheet's continuous-measurement example: CRA = 0x70 (8-sample average,
# 15 Hz), CRB = gain, mode = 0x00 (continuous).
import time

_REG_CRA = 0x00
_REG_CRB = 0x01
_REG_MODE = 0x02
_REG_DATA = 0x03
_REG_STATUS = 0x09
_REG_ID = 0x0A

# CRB value -> gain in LSB per gauss (datasheet table 9).
GAIN_0_88 = 0x00  # +-0.88 Ga, 1370 LSB/Ga
GAIN_1_3 = 0x20   # +-1.3 Ga, 1090 LSB/Ga (default)
GAIN_1_9 = 0x40   # +-1.9 Ga, 820 LSB/Ga
GAIN_2_5 = 0x60   # +-2.5 Ga, 660 LSB/Ga
GAIN_4_0 = 0x80   # +-4.0 Ga, 440 LSB/Ga
GAIN_4_7 = 0xA0   # +-4.7 Ga, 390 LSB/Ga
GAIN_5_6 = 0xC0   # +-5.6 Ga, 330 LSB/Ga
GAIN_8_1 = 0xE0   # +-8.1 Ga, 230 LSB/Ga
_LSB_PER_GAUSS = {0x00: 1370, 0x20: 1090, 0x40: 820, 0x60: 660,
                  0x80: 440, 0xA0: 390, 0xC0: 330, 0xE0: 230}

_OVERFLOW = -4096


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 0x10000 if v & 0x8000 else v


class HMC5883L:
    def __init__(self, i2c, addr=0x1E, gain=GAIN_1_3):
        self.i2c = i2c
        self.addr = addr
        if self._read(_REG_ID, 3) != b'H43':
            raise OSError('HMC5883L: ID is not "H43" (a module answering at 0x0D is a QMC5883L)')
        self.gain = gain
        self.overflow = False
        self._write(_REG_CRA, 0x70)  # 8 samples averaged, 15 Hz, normal measurement
        self._write(_REG_CRB, gain)
        self._write(_REG_MODE, 0x00)  # continuous-measurement mode
        # First data set is ready after 2/fDO (about 134 ms at 15 Hz).
        time.sleep_ms(140)

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def read_raw(self, timeout_ms=300):
        """Wait for RDY, then return the raw (x, y, z) counts."""
        t0 = time.ticks_ms()
        while not (self._read(_REG_STATUS, 1)[0] & 0x01):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('HMC5883L: no data ready (check wiring)')
            time.sleep_ms(5)
        d = self._read(_REG_DATA, 6)  # read all six bytes so the data registers unlock
        x = _s16(d[0], d[1])
        z = _s16(d[2], d[3])
        y = _s16(d[4], d[5])
        return x, y, z

    def read(self):
        """Return the field (x, y, z) in gauss. An axis that overflowed is None; pick a larger range."""
        k = _LSB_PER_GAUSS[self.gain]
        raw = self.read_raw()
        self.overflow = _OVERFLOW in raw
        return tuple(None if r == _OVERFLOW else r / k for r in raw)
