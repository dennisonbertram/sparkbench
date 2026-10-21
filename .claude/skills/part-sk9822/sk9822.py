# SK9822 addressable RGB LED strip (APA102-compatible two-wire SPI), MicroPython driver.
# Frame format from the SK9822 datasheet (Opsco, rev 01, section 9):
#   start frame : 32 zero bits
#   LED frame   : 0b111 + 5-bit global brightness, then BLUE, GREEN, RED (8 bits each, MSB first)
# The datasheet shows an end frame of 32 one bits, but the SK9822 (unlike the APA102) only
# moves the new colours to its outputs when it sees the NEXT start frame, and ones after the
# data can be taken as an extra LED frame. So, as Pololu and cpldcpu recommend, we send a
# 32-zero-bit "reset frame" after the LED data (latches this update) and then at least n/2
# more zero clock edges so the data reaches the last LED (each LED delays it by half a clock).
#
# Clock idles low and data is sampled on the rising edge: SPI mode 0 (polarity=0, phase=0).
# The datasheet allows up to 30 MHz; long wires and 3.3 V logic are happier at 1-4 MHz.
#
# brightness (0-31) sets the drive current of all three LEDs in each pixel (n/31 of 20 mA
# max), the 8-bit colour values set the PWM duty (n/256). Each pixel draws about 50 mA at
# full white with brightness 31.


class SK9822:
    def __init__(self, spi, n, brightness=4):
        self.spi = spi
        self.n = n
        self.brightness = brightness & 0x1F
        self.buf = [(0, 0, 0)] * n

    def __len__(self):
        return self.n

    def __setitem__(self, i, color):
        r, g, b = color
        self.buf[i] = (r & 0xFF, g & 0xFF, b & 0xFF)

    def __getitem__(self, i):
        return self.buf[i]

    def fill(self, color):
        r, g, b = color
        self.buf = [(r & 0xFF, g & 0xFF, b & 0xFF)] * self.n

    def set_brightness(self, level):
        """Global brightness 0-31 (drive current level/31)."""
        self.brightness = max(0, min(31, int(level)))

    def show(self):
        n = self.n
        out = bytearray(4 + 4 * n + 4 + (n + 15) // 16)  # all zeros
        hdr = 0xE0 | self.brightness
        k = 4
        for r, g, b in self.buf:
            out[k] = hdr
            out[k + 1] = b
            out[k + 2] = g
            out[k + 3] = r
            k += 4
        # out[k:] stays zero: 4-byte reset frame + end frame of n/2 clock edges.
        self.spi.write(out)
