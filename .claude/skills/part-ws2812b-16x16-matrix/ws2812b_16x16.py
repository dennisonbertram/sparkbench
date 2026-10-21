# WS2812B 16x16 flexible LED matrix (256 pixels), MicroPython helper.
# Uses MicroPython's built-in neopixel module, which produces the WS2812B's
# 800 kbit/s single-wire code (T0H 0.4 us, T1H 0.8 us, +-150 ns) and sends each
# pixel as 24 bits in G-R-B order, MSB first, as the Worldsemi datasheet requires.
# A low gap of more than 50 us after write() latches the new colours.
#
# The flexible 16x16 panels are wired in a zig-zag (serpentine): row 0 runs away
# from the DIN corner, row 1 runs back, and so on. If your panel is wired
# row-by-row in one direction, pass serpentine=False.
#
# brightness scales every colour (0.0-1.0). Each LED draws about 60 mA at full
# white, so the whole panel can pull about 15 A at 5 V. The default of 0.1 keeps a
# full-white frame near 1.5 A: still too much for a board's USB 5 V pin, so always
# feed the panel from a separate 5 V supply whose GND joins the board's GND.
import neopixel

WIDTH = 16
HEIGHT = 16


class Matrix16x16:
    WIDTH = WIDTH
    HEIGHT = HEIGHT

    def __init__(self, pin, serpentine=True, brightness=0.1):
        self.np = neopixel.NeoPixel(pin, WIDTH * HEIGHT)
        self.serpentine = serpentine
        self.brightness = max(0.0, min(1.0, brightness))

    def index(self, x, y):
        """Chain position of the pixel at column x, row y (0,0 = first LED after DIN)."""
        if not (0 <= x < WIDTH and 0 <= y < HEIGHT):
            raise ValueError('x and y must be 0-15')
        if self.serpentine and y & 1:
            x = WIDTH - 1 - x
        return y * WIDTH + x

    def _scale(self, color):
        b = self.brightness
        return (int(color[0] * b), int(color[1] * b), int(color[2] * b))

    def pixel(self, x, y, color):
        """Set one pixel to color = (r, g, b), 0-255 each. Call show() to send."""
        self.np[self.index(x, y)] = self._scale(color)

    def get(self, x, y):
        """The (r, g, b) bytes that will be sent for the pixel at x, y (after brightness)."""
        return self.np[self.index(x, y)]

    def fill(self, color):
        self.np.fill(self._scale(color))

    def clear(self):
        self.np.fill((0, 0, 0))

    def show(self):
        self.np.write()
