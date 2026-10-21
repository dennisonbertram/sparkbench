# MAX7219 4-in-1 32x8 LED dot matrix (FC-16 module), MicroPython driver.
# From the Maxim/Analog Devices MAX7219 datasheet: 16-bit frames (D15..D8 address, D11..D8 used,
# D7..D0 data) shifted MSB first on CLK rising edge (SPI mode 0, <= 10 MHz) and latched on the
# rising edge of LOAD (the CS pin). The four chips are cascaded DOUT -> DIN: during one LOAD-low
# burst the first frame sent ends up in the LAST chip of the chain. On the FC-16 module DIN enters
# the rightmost 8x8 block, so the leftmost block's frame is sent first.
# Power-up state (datasheet): shutdown, scan limit 0 (one row), no decode, minimum intensity,
# display test off.
from machine import Pin
import framebuf

_NOOP = 0x00
_DIGIT0 = 0x01       # digit registers 0x01..0x08 = rows 0..7 (top to bottom on FC-16)
_DECODEMODE = 0x09
_INTENSITY = 0x0A
_SCANLIMIT = 0x0B
_SHUTDOWN = 0x0C
_DISPLAYTEST = 0x0F


class Matrix(framebuf.FrameBuffer):
    """32x8 (8*num x 8) framebuffer. x = 0 is the left edge, y = 0 the top row.
    Use fill(), pixel(), text(), scroll() etc. from framebuf, then show()."""

    def __init__(self, spi, cs, num=4, brightness=1):
        # spi: machine.SPI(polarity=0, phase=0, baudrate <= 10_000_000); cs: GPIO number of CS/LOAD.
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.num = num
        self.buffer = bytearray(8 * num)
        # MONO_HLSB: byte (y * num + m) holds columns 8m..8m+7 of row y, bit 7 = leftmost pixel,
        # which is exactly one MAX7219 digit register on an FC-16 block (bit 7 = left column).
        super().__init__(self.buffer, 8 * num, 8, framebuf.MONO_HLSB)
        self._frame = bytearray(2 * num)
        self._all(_DISPLAYTEST, 0)   # normal operation
        self._all(_SCANLIMIT, 7)     # scan digits 0..7 = all 8 rows
        self._all(_DECODEMODE, 0)    # raw bits, no Code-B decode
        self.brightness(brightness)
        self.fill(0)
        self.show()
        self._all(_SHUTDOWN, 1)      # leave shutdown: display on

    def _send(self):
        self.cs(0)
        self.spi.write(self._frame)
        self.cs(1)                   # LOAD rising edge latches all chips at once

    def _all(self, reg, val):
        f = self._frame
        for m in range(self.num):
            f[2 * m] = reg
            f[2 * m + 1] = val
        self._send()

    def brightness(self, level):
        """0 (1/32 duty, dimmest) .. 15 (31/32 duty). Keep low on USB power: 4 chips at 15 with
        every LED on draw about 1.3 A."""
        self._all(_INTENSITY, max(0, min(15, level)))

    def power(self, on):
        """True = normal operation, False = shutdown (dark, display data kept)."""
        self._all(_SHUTDOWN, 1 if on else 0)

    def show(self):
        f = self._frame
        n = self.num
        for y in range(8):
            # Frame 0 travels furthest: it lands in the leftmost block (m = 0).
            for m in range(n):
                f[2 * m] = _DIGIT0 + y
                f[2 * m + 1] = self.buffer[y * n + m]
            self._send()
