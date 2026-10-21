# PCT2075 I2C-bus Fm+ digital temperature sensor and thermal watchdog (NXP PCT2075 Rev. 10.1), MicroPython driver.
# Register pointer: 0x00 Temp (read-only, 2 bytes), 0x01 Conf (1 byte), 0x02 Thyst (2 bytes),
# 0x03 Tos (2 bytes), 0x04 Tidle (1 byte).
# Temp: 11-bit two's complement in bits 15..5, 0.125 degC per LSB; the 5 low bits read as 0.
# Tos/Thyst: 9-bit two's complement in bits 15..7, 0.5 degC per LSB.
import time

_REG_TEMP = 0x00
_REG_CONF = 0x01
_REG_THYST = 0x02
_REG_TOS = 0x03
_REG_TIDLE = 0x04


class PCT2075:
    def __init__(self, i2c, addr=0x37):
        # 0x37 = A0, A1, A2 all floating (Adafruit breakout default); see datasheet Table 5.
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
        """Read (no argument) or write the 8-bit Conf register.
        B4:3 OS fault queue, B2 OS polarity (1 = active high), B1 1 = interrupt mode, B0 1 = shutdown."""
        if value is None:
            return self.i2c.readfrom_mem(self.addr, _REG_CONF, 1)[0]
        self.i2c.writeto_mem(self.addr, _REG_CONF, bytes([value & 0x1F]))

    def shutdown(self, off=True):
        """Conf bit 0: 1 = shutdown (under 1 uA, Temp keeps the last result), 0 = normal."""
        c = self.config()
        self.config((c | 0x01) if off else (c & ~0x01))
        if not off:
            time.sleep_ms(100)  # first new conversion (28 ms) completes within one 100 ms period

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

    def idle_time(self, value=None):
        """Sampling period in 100 ms steps (Tidle[4:0], 1-31; 0 behaves as 1 = 100 ms)."""
        if value is None:
            return self.i2c.readfrom_mem(self.addr, _REG_TIDLE, 1)[0] & 0x1F
        self.i2c.writeto_mem(self.addr, _REG_TIDLE, bytes([value & 0x1F]))
