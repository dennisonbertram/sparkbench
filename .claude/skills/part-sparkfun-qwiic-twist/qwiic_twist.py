# SparkFun Qwiic Twist (DEV-15083, RGB rotary encoder), MicroPython driver.
# An ATtiny84 running SparkFun's firmware (v1.2) counts the 24-detent encoder and reads its push
# switch, and serves a byte register map (a packed AVR struct, so 16-bit values are little-endian):
#   0x00 ID = 0x5C          0x01 status: bit2 clicked, bit1 pressed (live), bit0 moved
#   0x02/0x03 firmware major/minor   0x04 interrupt enable: bit1 button, bit0 encoder
#   0x05 count (int16)      0x07 difference since cleared (int16)
#   0x09 ms since last turn (uint16)  0x0B ms since last button event (uint16)
#   0x0D/0x0E/0x0F red/green/blue LED 0-255   0x10/0x12/0x14 connect red/green/blue (int16)
#   0x16 turn interrupt timeout ms (uint16, default 250)  0x18 I2C address  0x19 rotation limit (uint16)
# Read: write the register number, then read; the firmware streams bytes from that register on.
# Write: register number followed by the data bytes (consecutive registers).
# Only the clicked and moved status bits are writable (pressed is read-only and follows the switch).

ADDR = 0x3F          # 0x3E with the ADR jumper closed
DEVICE_ID = 0x5C

_ID = 0x00
_STATUS = 0x01
_VERSION = 0x02
_INT_ENABLE = 0x04
_COUNT = 0x05
_DIFF = 0x07
_LAST_TURN = 0x09
_LAST_BUTTON = 0x0B
_RED = 0x0D
_CONNECT_RED = 0x10
_TURN_INT_TIMEOUT = 0x16
_I2C_ADDRESS = 0x18
_LIMIT = 0x19

_CLICKED = 0x04
_PRESSED = 0x02
_MOVED = 0x01


class QwiicTwist:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr
        ident = self._read(_ID, 1)[0]
        if ident != DEVICE_ID:
            raise OSError('Qwiic Twist not found at 0x%02X (ID 0x%02X)' % (addr, ident))

    # --- low level
    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, data):
        self.i2c.writeto(self.addr, bytes([reg]) + bytes(data))

    def _u16(self, reg):
        d = self._read(reg, 2)
        return d[0] | (d[1] << 8)

    def _s16(self, reg):
        v = self._u16(reg)
        return v - 0x10000 if v & 0x8000 else v

    def _write16(self, reg, v):
        v &= 0xFFFF
        self._write(reg, (v & 0xFF, v >> 8))

    # --- identity
    def version(self):
        d = self._read(_VERSION, 2)
        return d[0], d[1]  # (major, minor)

    # --- encoder
    def count(self):
        """Detents turned since power-on (signed 16-bit; clockwise counts up)."""
        return self._s16(_COUNT)

    def set_count(self, n):
        self._write16(_COUNT, n)

    def diff(self, clear=True):
        """Detents turned since the difference was last cleared."""
        d = self._s16(_DIFF)
        if clear:
            self._write16(_DIFF, 0)
        return d

    def set_limit(self, limit):
        """0 = no limit; otherwise the count wraps within 0..limit (firmware 1.2+)."""
        self._write16(_LIMIT, limit)

    def time_since_turn(self):
        return self._u16(_LAST_TURN)

    def time_since_button(self):
        return self._u16(_LAST_BUTTON)

    # --- status / button
    def status(self):
        return self._read(_STATUS, 1)[0]

    def pressed(self):
        """True while the knob is pushed in."""
        return bool(self.status() & _PRESSED)

    def clicked(self):
        """True if the knob was pressed and released since the last call (clears the flag)."""
        s = self.status()
        if s & _CLICKED:
            self._write(_STATUS, (s & ~_CLICKED & 0xFF,))
            return True
        return False

    def moved(self):
        """True if the knob was turned since the last call (clears the flag)."""
        s = self.status()
        if s & _MOVED:
            self._write(_STATUS, (s & ~_MOVED & 0xFF,))
            return True
        return False

    def clear_interrupts(self):
        """Clear clicked and moved; the INT pin is released once no flag is set."""
        self._write(_STATUS, (0,))

    def enable_interrupts(self, button=True, encoder=True):
        self._write(_INT_ENABLE, ((2 if button else 0) | (1 if encoder else 0),))

    def set_turn_timeout(self, ms):
        """Quiet time after turning before INT fires (default 250 ms)."""
        self._write16(_TURN_INT_TIMEOUT, ms)

    # --- RGB LED in the knob (values are kept in the ATtiny's EEPROM)
    def set_color(self, r, g, b):
        self._write(_RED, (r & 0xFF, g & 0xFF, b & 0xFF))

    def color(self):
        d = self._read(_RED, 3)
        return d[0], d[1], d[2]

    def connect_color(self, r, g, b):
        """Change each colour by this much per detent (negative allowed); 0 disconnects it."""
        data = []
        for v in (r, g, b):
            v &= 0xFFFF
            data += [v & 0xFF, v >> 8]
        self._write(_CONNECT_RED, data)

    # --- address (stored in EEPROM; a closed ADR jumper forces 0x3E)
    def set_address(self, new_addr):
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(_I2C_ADDRESS, (new_addr,))
        self.addr = new_addr
