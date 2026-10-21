# LM75A digital temperature sensor and thermal watchdog (NXP LM75A Rev. 04), MicroPython driver.
# Register pointer: 0x00 Temp (read-only, 2 bytes), 0x01 Conf (1 byte), 0x02 Thyst (2 bytes), 0x03 Tos (2 bytes).
# Temp: 11-bit two's complement in bits 15..5, 0.125 degC per LSB; the 5 low bits are always 0.
# Tos/Thyst: 9-bit two's complement in bits 15..7, 0.5 degC per LSB.
import time

_REG_TEMP = 0x00
_REG_CONF = 0x01
_REG_THYST = 0x02
_REG_TOS = 0x03


class LM75A:
    def __init__(self, i2c, addr=0x48):
        self.i2c = i2c
        self.addr = addr

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        raw = (d[0] << 8) | d[1]
        return raw - 0x10000 if raw & 0x8000 else raw

    def _write16(self, reg, value):
        value &= 0xFFFF
        self.i2c.writeto_mem(self.addr, reg, bytes([value >> 8, value & 0xFF]))

    def temperature(self):
        """Temperature in degC, 0.125 degC resolution (datasheet section 7.4.3)."""
        return (self._read16(_REG_TEMP) >> 5) * 0.125

    def config(self, value=None):
        """Read (no argument) or write the 8-bit configuration register."""
        if value is None:
            return self.i2c.readfrom_mem(self.addr, _REG_CONF, 1)[0]
        self.i2c.writeto_mem(self.addr, _REG_CONF, bytes([value & 0x1F]))

    def shutdown(self, off=True):
        """Conf bit 0: 1 = shutdown (about 3.5 uA, Temp holds last result), 0 = normal (a conversion every 100 ms)."""
        c = self.config()
        self.config((c | 0x01) if off else (c & ~0x01))
        if not off:
            time.sleep_ms(100)  # first new conversion takes about 100 ms

    def tos(self, value=None):
        """Overtemperature shutdown threshold in degC (0.5 degC steps, power-up 80)."""
        if value is None:
            return (self._read16(_REG_TOS) >> 7) * 0.5
        self._write16(_REG_TOS, int(round(value * 2)) << 7)

    def thyst(self, value=None):
        """Hysteresis threshold in degC (0.5 degC steps, power-up 75)."""
        if value is None:
            return (self._read16(_REG_THYST) >> 7) * 0.5
        self._write16(_REG_THYST, int(round(value * 2)) << 7)
