# WS2812B 8x8 LED panel (64 pixels), MicroPython helper.
# Uses MicroPython's built-in neopixel module, which produces the WS2812B's
# 800 kbit/s single-wire code (T0H 0.4 us, T1H 0.8 us) and sends each pixel as
# 24 bits in G-R-B order, MSB first, exactly as the Worldsemi datasheet requires.
# A low gap of more than 50 us after write() latches the new colours.
#
# The flexible 8x8 panels are wired in a zig-zag (serpentine): row 0 runs left to
# right from the DIN corner, row 1 runs back right to left, and so on. If your panel
# is wired row-by-row in one direction instead, pass serpentine=False.
#
# brightness scales every colour (0.0-1.0). Each LED draws about 60 mA at full white,
# so the whole panel can pull about 3.8 A at 5 V. The default of 0.1 keeps it near
# 0.4 A, safe on a USB-powered board; raise it only with a separate 5 V supply.
import neopixel


class Matrix8x8:
    WIDTH = 8
    HEIGHT = 8

    def __init__(self, pin, serpentine=True, brightness=0.1):
        self.np = neopixel.NeoPixel(pin, 64)
        self.serpentine = serpentine
        self.brightness = max(0.0, min(1.0, brightness))

    def index(self, x, y):
        """Chain position of the pixel at column x, row y (0,0 = first LED after DIN)."""
        if not (0 <= x < 8 and 0 <= y < 8):
            raise ValueError('x and y must be 0-7')
        if self.serpentine and y & 1:
            x = 7 - x
        return y * 8 + x

    def _scale(self, color):
        b = self.brightness
        return (int(color[0] * b), int(color[1] * b), int(color[2] * b))

    def pixel(self, x, y, color):
        """Set one pixel to color = (r, g, b), 0-255 each. Call show() to send."""
        self.np[self.index(x, y)] = self._scale(color)

    def fill(self, color):
        self.np.fill(self._scale(color))

    def clear(self):
        self.np.fill((0, 0, 0))

    def show(self):
        self.np.write()
