# M5Stack Unit 4Relay (SKU U097), MicroPython driver.
# An STM32F030F4P6 runs M5Stack's firmware at I2C address 0x26 with two byte registers
# (write [reg, value] to set; write [reg] then read 1 byte to get):
#   0x10 mode:  bit 0 = LED sync. 1 = each LED follows its relay, 0 = LEDs set by hand.
#   0x11 state: bits 0-3 = relays 1-4, bits 4-7 = LEDs 1-4 (1 = on).
# Bit numbering follows M5Stack's own Arduino (Unit_4RELAY) and UiFlow2 (relay4.py) libraries.
import time

ADDR = 0x26
REG_MODE = 0x10
REG_STATE = 0x11

MODE_MANUAL = 0  # LEDs controlled independently
MODE_SYNC = 1    # LED n lights while relay n is on


class Unit4Relay:
    def __init__(self, i2c, addr=ADDR, sync=True):
        self.i2c = i2c
        self.addr = addr
        if addr not in i2c.scan():
            raise OSError('Unit 4Relay not found at 0x%02X' % addr)
        # Same start-up as M5Stack's Init(mode): set the mode, then all relays and LEDs off.
        self.set_mode(MODE_SYNC if sync else MODE_MANUAL)
        self._write(REG_STATE, 0x00)

    def _write(self, reg, val):
        time.sleep_ms(1)  # the STM32 firmware needs a short gap between transactions
        self.i2c.writeto(self.addr, bytes([reg, val & 0xFF]))

    def _read(self, reg):
        time.sleep_ms(1)
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, 1)[0]

    def set_mode(self, mode):
        self._write(REG_MODE, 1 if mode else 0)

    def mode(self):
        return self._read(REG_MODE) & 0x01

    def state(self):
        """Raw state register: bits 0-3 relays 1-4, bits 4-7 LEDs 1-4."""
        return self._read(REG_STATE)

    def relays(self):
        """Relay bits only (bit 0 = relay 1 ... bit 3 = relay 4)."""
        return self.state() & 0x0F

    def relay(self, n, on=None):
        """relay(n) returns 1/0; relay(n, True/False) switches relay n (1-4)."""
        if not 1 <= n <= 4:
            raise ValueError('relay number must be 1-4')
        bit = 1 << (n - 1)
        s = self.state()
        if on is None:
            return 1 if s & bit else 0
        self._write(REG_STATE, (s | bit) if on else (s & ~bit))

    def led(self, n, on=None):
        """LED n (1-4); only meaningful in manual mode (sync=False)."""
        if not 1 <= n <= 4:
            raise ValueError('LED number must be 1-4')
        bit = 1 << (n + 3)
        s = self.state()
        if on is None:
            return 1 if s & bit else 0
        self._write(REG_STATE, (s | bit) if on else (s & ~bit))

    def all(self, on):
        """All four relays on or off (keeps the LED bits)."""
        s = self.state()
        self._write(REG_STATE, (s | 0x0F) if on else (s & 0xF0))
