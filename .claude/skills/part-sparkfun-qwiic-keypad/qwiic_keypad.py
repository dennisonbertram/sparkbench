# SparkFun Qwiic Keypad - 12 Button (COM-15290), MicroPython driver.
# The board's ATtiny84 runs SparkFun's Qwiic_KeyPad firmware, which scans the 4x3 key matrix and keeps the
# last key presses in a FIFO (ring of 15 slots). Register map (firmware memoryMap / hookup guide):
#   0x00 id (= 0x4B, the default address)   0x01/0x02 firmware major/minor
#   0x03 oldest key in the FIFO as ASCII ('0'-'9', '*', '#'; 0 = none)
#   0x04/0x05 ms since that key was pressed (MSB first)
#   0x06 bit0 = "load the next FIFO entry" command; the firmware acts on it at the NEXT read request
#   0x07 I2C address (stored in EEPROM, 0x08-0x77)
# Reads: write the register number, then read; the firmware sends the map from that register onward.
from micropython import const
import time

_ID = const(0x00)
_FW_MAJOR = const(0x01)
_FW_MINOR = const(0x02)
_BUTTON = const(0x03)
_TIME_MSB = const(0x04)
_UPDATE_FIFO = const(0x06)
_CHANGE_ADDRESS = const(0x07)


class QwiicKeypad:
    def __init__(self, i2c, addr=0x4B):
        self.i2c = i2c
        self.addr = addr
        # Register 0x00 always holds the firmware's default address 0x4B, even after an address change.
        if self._read(_ID)[0] != 0x4B:
            raise OSError('Qwiic Keypad not found at 0x%02X (wrong ID)' % addr)

    def _read(self, reg, n=1):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, val):
        self.i2c.writeto(self.addr, bytes([reg, val & 0xFF]))

    def version(self):
        d = self._read(_FW_MAJOR, 2)
        return 'v%d.%d' % (d[0], d[1])

    def update_fifo(self):
        """Ask the keypad to load its oldest stored key into 0x03-0x05 on the next read."""
        self._write(_UPDATE_FIFO, 0x01)

    def button(self):
        """Key code (ASCII) currently loaded in register 0x03, 0 if none."""
        return self._read(_BUTTON)[0]

    def time_since_pressed(self):
        d = self._read(_TIME_MSB, 2)
        return (d[0] << 8) | d[1]

    def read_event(self):
        """Pop the oldest key press. Returns (key_char, ms_ago) or None when the FIFO is empty.
        ms_ago is 16-bit (wraps after 65.535 s)."""
        self.update_fifo()
        d = self._read(_BUTTON, 3)   # this read triggers the FIFO load, then returns 0x03..0x05
        if d[0] == 0:
            return None
        return chr(d[0]), (d[1] << 8) | d[2]

    def get_key(self):
        """Oldest stored key as a one-character string, or None."""
        e = self.read_event()
        return e[0] if e else None

    def set_address(self, new_addr):
        """Store a new I2C address in the keypad's EEPROM (ignored while the ADR jumper is closed: 0x4A)."""
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(_CHANGE_ADDRESS, new_addr)
        time.sleep_ms(100)
        self.addr = new_addr
