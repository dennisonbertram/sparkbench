# M5Stack Unit Encoder (SKU U135), MicroPython driver.
# An STM32F030F4P6 running M5Stack's firmware counts the knob and reads its push switch.
# I2C address 0x40. Register map (M5Stack Unit Encoder I2C protocol, firmware V1/V1.1):
#   0x00 MODE    (W)   0 = pulse (default), 1 = AB
#   0x10 COUNTER (R/W) signed 16-bit count, low byte first (0x10 = L, 0x11 = H)
#   0x20 SWITCH  (R)   1 byte; reads 0 while the knob is pressed (switch to GND, 10 k pull-up),
#                      as M5Stack's own Arduino example and UIFlow driver use it
#   0x30 RGB     (W)   LED index (0 = both, 1, 2), then R, G, B (0-255 each)
#   0x40 RESET   (W)   write 1 to clear the counter
# Every access: write the register number, then read (or write data after it in the same transfer).

_ADDR = 0x40
_REG_MODE = 0x00
_REG_COUNTER = 0x10
_REG_BUTTON = 0x20
_REG_RGB = 0x30
_REG_RESET = 0x40


class UnitEncoder:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        if addr not in i2c.scan():
            raise OSError('Unit Encoder not found at 0x%02x: check the Grove cable and 5 V supply' % addr)

    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, data):
        self.i2c.writeto(self.addr, bytes([reg]) + bytes(data))

    def value(self):
        """Encoder count (signed 16-bit, wraps at +/-32768)."""
        b = self._read(_REG_COUNTER, 2)
        v = b[0] | (b[1] << 8)
        return v - 0x10000 if v & 0x8000 else v

    def set_value(self, v):
        """Write the counter (signed 16-bit)."""
        v &= 0xFFFF
        self._write(_REG_COUNTER, (v & 0xFF, v >> 8))

    def reset(self):
        """Clear the counter to 0."""
        self._write(_REG_RESET, (1,))

    def pressed(self):
        """True while the knob is pushed in (switch register reads 0)."""
        return self._read(_REG_BUTTON, 1)[0] == 0

    def set_mode(self, ab=False):
        """Counting mode: False = pulse (default), True = AB."""
        self._write(_REG_MODE, (1 if ab else 0,))

    def set_led(self, index, r, g, b):
        """Set an RGB LED: index 0 = both, 1 or 2 = one LED; r, g, b 0-255."""
        self._write(_REG_RGB, (index, r & 0xFF, g & 0xFF, b & 0xFF))
