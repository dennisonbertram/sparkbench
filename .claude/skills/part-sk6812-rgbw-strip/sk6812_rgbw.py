# SK6812 RGBW addressable LED strip (60 LEDs/m, 5 V), MicroPython helper.
# Uses MicroPython's built-in neopixel module with bpp=4. It produces the SK6812's
# 800 kbit/s single-wire code (0 bit: about 0.4 us high; 1 bit: about 0.8 us high;
# both inside the datasheet's 0.3/0.6 us +-0.15 us windows and 1.25 us +-0.6 us bit
# period) and sends 32 bits per LED, MSB first. With bpp=4 neopixel's default byte
# order is G, R, B, W, which is what SK6812RGBW strips expect (the OPSCO datasheet's
# bit table prints R first, but real parts, Adafruit's NEO_GRBW and MicroPython all
# use G-R-B-W). A low of more than 80 us after write() latches the new colours.
#
# brightness scales every channel (0.0-1.0). Each LED draws up to about 80 mA with
# all four channels at full (about 4.8 A for a 60-LED metre at 5 V), so feed the
# strip from its own 5 V supply. The default of 0.1 keeps the current low.
import neopixel


class SK6812RGBW:
    def __init__(self, pin, n=60, brightness=0.1):
        self.n = n
        self.np = neopixel.NeoPixel(pin, n, bpp=4)
        self.brightness = max(0.0, min(1.0, brightness))

    def _scale(self, color):
        if len(color) != 4:
            raise ValueError('color must be (r, g, b, w)')
        b = self.brightness
        return tuple(max(0, min(255, int(c * b))) for c in color)

    def pixel(self, i, color):
        """Set LED i (0 = first LED after DIN) to (r, g, b, w), 0-255 each. Call show() to send."""
        self.np[i] = self._scale(color)

    def fill(self, color):
        self.np.fill(self._scale(color))

    def clear(self):
        self.np.fill((0, 0, 0, 0))

    def get(self, i):
        """The (r, g, b, w) bytes that will be sent to LED i (after brightness scaling)."""
        return self.np[i]

    def show(self):
        self.np.write()
