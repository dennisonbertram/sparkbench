# APA102 / APA102C addressable LED strip, MicroPython driver.
# Two-wire synchronous protocol from the iPixel APA102C datasheet:
#   * data (DI) is sampled on the RISING edge of the clock (CI), MSB first -> SPI mode 0
#     (polarity=0, phase=0). No chip select: every byte on the bus goes down the strip.
#   * start frame: 32 zero bits
#   * one 32-bit frame per LED: 0b111 + 5-bit global brightness (0-31), then BLUE, GREEN, RED
#     (8 bits each, 0-255 PWM duty)
#   * end frame: 1 bits. The datasheet shows 32; each LED delays the data by half a clock,
#     so long strips need at least n/2 extra clock edges: we send max(4, ceil(n/16)) bytes of 0xFF.
# Up to 60 mA per LED at full white: keep brightness low on USB power.


class APA102:
    def __init__(self, spi, n, brightness=4):
        self.spi = spi
        self.n = n
        self.brightness = brightness
        self.buf = bytearray(4 * n)
        self.end = b'\xff' * max(4, (n + 15) // 16)
        self.fill((0, 0, 0))

    @property
    def brightness(self):
        return self._gb

    @brightness.setter
    def brightness(self, value):
        """Global brightness 0-31 (5-bit current setting from the datasheet)."""
        self._gb = max(0, min(31, int(value)))

    def __len__(self):
        return self.n

    def __setitem__(self, i, color):
        """color = (r, g, b), 0-255 each. Optional 4th item = per-LED brightness 0-31."""
        r, g, b = color[0], color[1], color[2]
        gb = color[3] if len(color) > 3 else self._gb
        o = 4 * i
        self.buf[o] = 0xE0 | (max(0, min(31, gb)))
        self.buf[o + 1] = b & 0xFF
        self.buf[o + 2] = g & 0xFF
        self.buf[o + 3] = r & 0xFF

    def __getitem__(self, i):
        o = 4 * i
        return (self.buf[o + 3], self.buf[o + 2], self.buf[o + 1])

    def fill(self, color):
        for i in range(self.n):
            self[i] = color

    def show(self):
        self.spi.write(b'\x00\x00\x00\x00')  # start frame
        self.spi.write(self.buf)
        self.spi.write(self.end)
