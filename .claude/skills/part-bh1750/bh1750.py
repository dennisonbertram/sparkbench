# BH1750 ambient light sensor (ROHM BH1750FVI), MicroPython driver.
# One-time H-resolution mode (opcode 0x20): 1 lx resolution, 120 ms typ / 180 ms max,
# then the chip returns to power-down by itself. lux = raw / 1.2 (default MTreg = 69).
# The chip accepts one opcode per I2C transaction (a STOP after every opcode).
import time

POWER_DOWN = 0x00
POWER_ON = 0x01
RESET = 0x07
ONE_TIME_H_RES = 0x20


class BH1750:
    def __init__(self, i2c, addr=0x23):
        self.i2c = i2c
        self.addr = addr  # 0x23 with ADDR low (default on GY-302), 0x5C with ADDR high
        self._cmd(POWER_ON)
        self._cmd(RESET)  # clears the data register; only works in power-on mode
        self._cmd(POWER_DOWN)

    def _cmd(self, op):
        self.i2c.writeto(self.addr, bytes([op]))

    def lux(self):
        """Measure once and return the illuminance in lux."""
        self._cmd(POWER_ON)
        self._cmd(ONE_TIME_H_RES)
        time.sleep_ms(180)  # max H-resolution measurement time
        d = self.i2c.readfrom(self.addr, 2)
        raw = (d[0] << 8) | d[1]
        return raw / 1.2
