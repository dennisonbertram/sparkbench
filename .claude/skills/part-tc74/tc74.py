# TC74 tiny serial digital thermal sensor (Microchip DS21462D), MicroPython driver.
# SMBus/I2C, 10-100 kHz only. Command byte (register): 0x00 RTR = TEMP (read-only),
# 0x01 RWCR = CONFIG (D7 SHDN: 1 = standby, D6 DATA_RDY: 1 = ready, read-only).
# TEMP: one byte, two's complement, 1 degC per LSB (0x19 = 25 C, 0xE7 = -25 C).
# The chip rounds down: 25.75 C reads 25, -0.25 C reads -1 (Table 4-4).
# Address 1001 A2A1A0 is set by the part number: TC74A0 = 0x48 ... TC74A5 = 0x4D (default) ... TC74A7 = 0x4F.
import time

_RTR = 0x00
_RWCR = 0x01
_SHDN = 0x80
_DATA_RDY = 0x40


class TC74:
    def __init__(self, i2c, addr=0x48):
        self.i2c = i2c
        self.addr = addr

    def config(self, value=None):
        """Read (no argument) or write the CONFIG register."""
        if value is None:
            return self.i2c.readfrom_mem(self.addr, _RWCR, 1)[0]
        self.i2c.writeto_mem(self.addr, _RWCR, bytes([value & _SHDN]))

    def ready(self):
        """True once a conversion has finished since power-up or leaving standby."""
        return bool(self.config() & _DATA_RDY)

    def wait_ready(self, timeout_ms=300):
        """Wait for DATA_RDY (datasheet: at most 250 ms after power-on). Returns True if ready."""
        t0 = time.ticks_ms()
        while not self.ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return False
            time.sleep_ms(10)
        return True

    def temperature(self):
        """Temperature in whole degC (Read Byte, command 0x00, two's complement)."""
        raw = self.i2c.readfrom_mem(self.addr, _RTR, 1)[0]
        return raw - 256 if raw & 0x80 else raw

    def standby(self, on=True):
        """SHDN = 1: A/D halted, TEMP frozen, about 5 uA. SHDN = 0: normal, 8 samples/s."""
        self.config(_SHDN if on else 0)
