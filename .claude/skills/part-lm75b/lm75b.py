# LM75B digital temperature sensor and thermal watchdog (NXP LM75B Rev. 6.1), MicroPython driver.
# Pointer byte selects the register: 0x00 Temp (read-only, 2 bytes), 0x01 Conf (1 byte),
# 0x02 Thyst (2 bytes, POR 0x4B00 = 75 degC), 0x03 Tos (2 bytes, POR 0x5000 = 80 degC).
# Temp: 11-bit two's complement in bits 15..5, 0.125 degC per LSB (datasheet section 7.4.3).
# Tos/Thyst: 9-bit two's complement in bits 15..7, 0.5 degC per LSB (section 7.4.4).
import time

_REG_TEMP = 0x00
_REG_CONF = 0x01
_REG_THYST = 0x02
_REG_TOS = 0x03


class LM75B:
    def __init__(self, i2c, addr=0x48):
        self.i2c = i2c
        self.addr = addr
        # Section 7.4.1: the first temperature reading after power-up is incorrect and
        # must be ignored. Wait for a conversion (10 ms every 100 ms) and discard one read.
        time.sleep_ms(120)
        self._read16(_REG_TEMP)

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)  # MSByte first
        raw = (d[0] << 8) | d[1]
        return raw - 0x10000 if raw & 0x8000 else raw

    def _write16(self, reg, value):
        value &= 0xFFFF
        self.i2c.writeto_mem(self.addr, reg, bytes([value >> 8, value & 0xFF]))

    def temperature(self):
        """Temperature in degC, 0.125 degC resolution."""
        return (self._read16(_REG_TEMP) >> 5) * 0.125

    def config(self, value=None):
        """Read (no argument) or write the configuration register (bits 7..5 reserved, keep 0)."""
        if value is None:
            return self.i2c.readfrom_mem(self.addr, _REG_CONF, 1)[0]
        self.i2c.writeto_mem(self.addr, _REG_CONF, bytes([value & 0x1F]))

    def shutdown(self, off=True):
        """Conf bit 0: 1 = shutdown (about 0.2 uA, Temp keeps the last result), 0 = normal."""
        c = self.config()
        self.config((c | 0x01) if off else (c & ~0x01))
        if not off:
            time.sleep_ms(110)  # wait for a fresh conversion

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
