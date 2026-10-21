# MAX7219 8x8 LED dot matrix (FC-16 style module), MicroPython driver.
# Register map, power-up state and serial format from the Maxim/Analog Devices MAX7219 datasheet:
# 16-bit frames (D15..D8 = address, D7..D0 = data) shifted MSB first on CLK rising edge
# (SPI mode 0, up to 10 MHz) and latched on the rising edge of LOAD (the CS pin).
# Cascaded modules: every module gets one frame per LOAD pulse; the first frame sent
# ends up in the LAST module of the chain, so frames are sent last module first.
from machine import Pin

_NOOP = 0x00
_DIGIT0 = 0x01      # digit registers 0x01..0x08 = matrix rows 0..7
_DECODEMODE = 0x09
_INTENSITY = 0x0A
_SCANLIMIT = 0x0B
_SHUTDOWN = 0x0C
_DISPLAYTEST = 0x0F


class MAX7219:
    def __init__(self, spi, cs, num=1, brightness=3):
        """spi: a machine.SPI (polarity=0, phase=0, <= 10 MHz); cs: GPIO number of the CS/LOAD pin;
        num: how many 8x8 modules are chained (DOUT -> DIN)."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.num = num
        self.rows = [bytearray(8) for _ in range(num)]
        # Power-up state per datasheet: shutdown, scan one digit, no decode, minimum intensity.
        self._all(_DISPLAYTEST, 0)   # normal operation (test mode overrides everything)
        self._all(_SCANLIMIT, 7)     # scan all 8 digits = all 8 rows
        self._all(_DECODEMODE, 0)    # no Code-B decode: raw bits for a matrix
        self.brightness(brightness)
        self.clear()
        self.show()
        self._all(_SHUTDOWN, 1)      # leave shutdown: display on

    def _write(self, frames):
        # frames: list of (reg, data), index 0 = first module (nearest the microcontroller).
        buf = bytearray(2 * self.num)
        for i, (reg, val) in enumerate(reversed(frames)):
            buf[2 * i] = reg
            buf[2 * i + 1] = val
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)  # LOAD rising edge latches the last 16 bits in each chip

    def _all(self, reg, val):
        self._write([(reg, val)] * self.num)

    def brightness(self, level):
        """0 (dimmest, 1/32 duty) .. 15 (brightest, 31/32 duty)."""
        self._all(_INTENSITY, max(0, min(15, level)))

    def power(self, on):
        """True = normal operation, False = shutdown (display dark, data kept)."""
        self._all(_SHUTDOWN, 1 if on else 0)

    def clear(self):
        for m in self.rows:
            for r in range(8):
                m[r] = 0

    def pixel(self, x, y, on=True):
        """x = 0..8*num-1 left to right, y = 0..7 top to bottom (FC-16 orientation: bit 7 is the left column)."""
        m, c = divmod(x, 8)
        if on:
            self.rows[m][y] |= 0x80 >> c
        else:
            self.rows[m][y] &= ~(0x80 >> c) & 0xFF

    def set_row(self, y, bits, module=0):
        """Set row y (0 = top) of one module to an 8-bit pattern, bit 7 = leftmost LED."""
        self.rows[module][y] = bits & 0xFF

    def show(self):
        for r in range(8):
            self._write([(_DIGIT0 + r, self.rows[m][r]) for m in range(self.num)])
