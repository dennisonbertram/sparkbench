# Adafruit 1.2" 4-digit 7-segment display with HT16K33 I2C backpack, MicroPython driver.
# Commands from the Holtek HT16K33 datasheet (v1.10):
#   0x21          system setup, S=1: internal oscillator on (leave standby)
#   0x80|B1B0|D   display setup: D=1 display on, B1B0 = blink (00 off, 01 2 Hz, 10 1 Hz, 11 0.5 Hz)
#   0xE0|P        dimming, P = 0..15 -> 1/16 .. 16/16 duty
#   0x00, d0..d15 write display RAM from address 0 (address pointer auto-increments)
# Backpack wiring (Adafruit): digits are RAM bytes 0, 2, 6, 8 (bit 0..6 = segments a..g,
# bit 7 = decimal point); byte 4 holds the indicators: bit 1 centre colon, bit 2 top-left dot,
# bit 3 bottom-left dot, bit 4 right (AM/PM) dot.

_DIGIT_POS = (0, 2, 6, 8)
_FONT = {
    '0': 0x3F, '1': 0x06, '2': 0x5B, '3': 0x4F, '4': 0x66,
    '5': 0x6D, '6': 0x7D, '7': 0x07, '8': 0x7F, '9': 0x6F,
    'A': 0x77, 'B': 0x7C, 'C': 0x39, 'D': 0x5E, 'E': 0x79, 'F': 0x71,
    '-': 0x40, ' ': 0x00, '_': 0x08,
}
COLON = 0x02
TOP_LEFT_DOT = 0x04
BOTTOM_LEFT_DOT = 0x08
RIGHT_DOT = 0x10


class BigSeg7x4:
    def __init__(self, i2c, addr=0x70, brightness=15):
        self.i2c = i2c
        self.addr = addr
        self.buf = bytearray(16)
        self.i2c.writeto(addr, b'\x21')  # oscillator on
        self.brightness(brightness)
        self.blink(0)                    # display on, no blinking
        self.show()

    def brightness(self, level):
        """0 (dimmest, 1/16 duty) .. 15 (brightest, 16/16 duty)."""
        self.i2c.writeto(self.addr, bytes([0xE0 | (max(0, min(15, level)))]))

    def blink(self, rate=0, on=True):
        """rate 0 = steady, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz; on=False blanks the display."""
        self.i2c.writeto(self.addr, bytes([0x80 | ((rate & 3) << 1) | (1 if on else 0)]))

    def show(self):
        self.i2c.writeto(self.addr, b'\x00' + self.buf)

    def fill(self, on=False):
        for i in range(16):
            self.buf[i] = 0xFF if on else 0
        self.show()

    def set_digit(self, n, raw):
        """Raw segment byte for digit n (0 = leftmost)."""
        self.buf[_DIGIT_POS[n]] = raw & 0xFF

    def set_indicators(self, mask):
        """OR of COLON, TOP_LEFT_DOT, BOTTOM_LEFT_DOT, RIGHT_DOT."""
        self.buf[4] = mask & 0x1E

    def text(self, s):
        """Show up to 4 characters, right-aligned; a '.' lights the previous digit's point,
        a ':' lights the centre colon."""
        segs = []
        ind = 0
        for ch in str(s).upper():
            if ch == '.' and segs:
                segs[-1] |= 0x80
            elif ch == ':':
                ind |= COLON
            else:
                segs.append(_FONT.get(ch, 0x00))
        segs = segs[-4:]
        segs = [0] * (4 - len(segs)) + segs
        for n in range(4):
            self.set_digit(n, segs[n])
        self.set_indicators(ind)
        self.show()

    def number(self, value, decimals=0):
        if decimals:
            self.text(('%.' + str(decimals) + 'f') % value)
        else:
            self.text('%d' % value)

    def time(self, hours, minutes):
        self.text('%02d:%02d' % (hours, minutes))
