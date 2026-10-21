# MAX7219 8-digit 7-segment LED display module, MicroPython driver.
# Written from the Maxim/Analog Devices MAX7219/MAX7221 datasheet (19-4452 Rev 4):
# 16-bit frames, MSB first, D11-D8 = register address, D7-D0 = data, shifted in on CLK
# rising edges (SPI mode 0, up to 10 MHz) and latched on the rising edge of LOAD (CS).
# Digits use the chip's Code B font (0-9, -, E, H, L, P, blank; D7 = decimal point).
# Digit 0 (register 0x01) is the RIGHTMOST digit on the common 8-digit module.
from machine import Pin

_NOOP = 0x00
_DECODE_MODE = 0x09
_INTENSITY = 0x0A
_SCAN_LIMIT = 0x0B
_SHUTDOWN = 0x0C
_DISPLAY_TEST = 0x0F

# Code B font register values (datasheet Table 5).
_CODE_B = {'0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
           '-': 0x0A, 'E': 0x0B, 'H': 0x0C, 'L': 0x0D, 'P': 0x0E, ' ': 0x0F}


class MAX7219:
    def __init__(self, spi, cs, digits=8, brightness=7):
        """spi: a machine.SPI in mode 0 (polarity=0, phase=0), <= 10 MHz. cs: GPIO number of the CS/LOAD pin."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.digits = digits
        self._buf = bytearray(2)
        # The chip powers up in shutdown with all control registers reset; some modules
        # power up with display test on, so clear it explicitly.
        self._reg(_DISPLAY_TEST, 0)
        self._reg(_SHUTDOWN, 0)                 # stay blank while configuring
        self._reg(_SCAN_LIMIT, digits - 1)      # scan digits 0..digits-1
        self._reg(_DECODE_MODE, 0xFF)           # Code B decode on every digit
        self.brightness(brightness)
        self.clear()
        self._reg(_SHUTDOWN, 1)                 # normal operation

    def _reg(self, reg, val):
        self._buf[0] = reg & 0x0F
        self._buf[1] = val & 0xFF
        self.cs(0)
        self.spi.write(self._buf)
        self.cs(1)                              # LOAD rising edge latches the 16 bits

    def brightness(self, level):
        """0 (1/32 duty) .. 15 (31/32 duty)."""
        self._reg(_INTENSITY, max(0, min(15, level)))

    def on(self):
        self._reg(_SHUTDOWN, 1)

    def off(self):
        self._reg(_SHUTDOWN, 0)

    def clear(self):
        for d in range(self.digits):
            self._reg(d + 1, 0x0F)              # Code B blank

    def text(self, s):
        """Show a string of 0-9, '-', 'E', 'H', 'L', 'P', ' ' and '.', right-aligned."""
        cells = []
        for c in str(s).upper():
            if c == '.' and cells and not cells[-1] & 0x80:
                cells[-1] |= 0x80               # D7 lights the previous digit's decimal point
            elif c == '.':
                cells.append(0x0F | 0x80)
            else:
                if c not in _CODE_B:
                    raise ValueError('MAX7219 Code B cannot show %r' % c)
                cells.append(_CODE_B[c])
        if len(cells) > self.digits:
            raise ValueError('too long for %d digits' % self.digits)
        cells = [0x0F] * (self.digits - len(cells)) + cells
        for i, v in enumerate(reversed(cells)):
            self._reg(i + 1, v)                 # register 1 = digit 0 = rightmost

    def number(self, n, decimals=None):
        """Show an int, or a float with the given number of decimals."""
        self.text(str(n) if decimals is None else '%.*f' % (decimals, n))
