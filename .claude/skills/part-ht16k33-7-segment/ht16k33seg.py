# HT16K33 4-digit 7-segment backpack (Adafruit 0.56" display), MicroPython driver.
# Written from the Holtek HT16K33 datasheet (Rev 1.10) and the Adafruit backpack schematic:
#   0x21        system setup: oscillator on (normal operation)
#   0x80|B<<1|D display setup: D = display on, B = blink (0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz)
#   0xE0|P      dimming: P = 0..15 -> 1/16 .. 16/16 duty
#   0x00 + data display RAM write from address 0 (address pointer auto-increments)
# On the backpack each digit is wired to one COM line, segment a..g,DP to ROW0..ROW7,
# so digit n is the low byte of RAM row n: bytes 0, 2, 6, 8 (left to right).
# Byte 4 is the colon: bit 1 (0x02) lights the centre colon.
from micropython import const

_OSC_ON = const(0x21)
_DISPLAY = const(0x80)
_DIMMING = const(0xE0)

DIGIT_POS = (0, 2, 6, 8)
COLON_POS = 4

# bit0 = a, bit1 = b, ... bit6 = g, bit7 = decimal point
FONT = {
    '0': 0x3F, '1': 0x06, '2': 0x5B, '3': 0x4F, '4': 0x66,
    '5': 0x6D, '6': 0x7D, '7': 0x07, '8': 0x7F, '9': 0x6F,
    'A': 0x77, 'B': 0x7C, 'C': 0x39, 'D': 0x5E, 'E': 0x79, 'F': 0x71,
    'G': 0x3D, 'H': 0x76, 'I': 0x30, 'J': 0x1E, 'L': 0x38, 'N': 0x54,
    'O': 0x5C, 'P': 0x73, 'Q': 0x67, 'R': 0x50, 'T': 0x78, 'U': 0x3E,
    'Y': 0x6E, '-': 0x40, '_': 0x08, ' ': 0x00,
}


class HT16K33Seg:
    def __init__(self, i2c, address=0x70, brightness=15):
        self.i2c = i2c
        self.address = address
        self.buf = bytearray(16)
        self._cmd(_OSC_ON)            # leave standby: start the internal oscillator
        self.brightness(brightness)
        self.show()                   # clear RAM before switching the display on
        self.blink(0)                 # display on, no blinking

    def _cmd(self, c):
        self.i2c.writeto(self.address, bytes((c,)))

    def brightness(self, level):
        """0 (dimmest, 1/16 duty) .. 15 (brightest, 16/16 duty)."""
        self._cmd(_DIMMING | (max(0, min(15, int(level)))))

    def blink(self, rate):
        """0 = steady, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz. Also switches the display on."""
        self._cmd(_DISPLAY | ((rate & 3) << 1) | 1)

    def off(self):
        self._cmd(_DISPLAY)

    def clear(self):
        for i in range(16):
            self.buf[i] = 0

    def raw(self, digit, mask):
        """Set digit 0..3 (left to right) to a raw segment mask (bit0 = a .. bit7 = DP)."""
        self.buf[DIGIT_POS[digit]] = mask & 0xFF

    def colon(self, on=True):
        self.buf[COLON_POS] = 0x02 if on else 0x00

    def text(self, s):
        """Show up to 4 characters, right-aligned. '.' lights the previous digit's
        decimal point, ':' lights the colon. Unknown characters are blank."""
        masks = []
        colon = False
        for ch in str(s):
            if ch == '.':
                if masks and not masks[-1] & 0x80:
                    masks[-1] |= 0x80
                else:
                    masks.append(0x80)
            elif ch == ':':
                colon = True
            else:
                masks.append(FONT.get(ch.upper(), 0x00))
        masks = masks[-4:]
        masks = [0] * (4 - len(masks)) + masks
        for i in range(4):
            self.buf[DIGIT_POS[i]] = masks[i]
        self.colon(colon)
        self.show()

    def number(self, value, decimals=0):
        """Show a number right-aligned; shows '----' if it does not fit."""
        if decimals:
            s = ('%.' + str(int(decimals)) + 'f') % value
        else:
            s = '%d' % round(value)
        if len(s.replace('.', '')) > 4:
            s = '----'
        self.text(s)

    def show(self):
        self.i2c.writeto(self.address, b'\x00' + self.buf)
