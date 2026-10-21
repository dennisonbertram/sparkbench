# HT16K33 quad 14-segment alphanumeric backpack (Adafruit 0.54" display, product 1911/1912), MicroPython driver.
# Written from the Holtek HT16K33 datasheet (Rev 1.10) and the Adafruit backpack schematic / library:
#   0x21        system setup: S = 1, internal oscillator on (normal operation)
#   0x80|B<<1|D display setup: D = display on, B = blink (0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz)
#   0xE0|P      dimming set: P = 0..15 -> 1/16 .. 16/16 duty
#   0x00 + data display RAM write from address 0 (the address pointer auto-increments)
# Each digit n (0 = leftmost) is driven by COM n; its 16-bit segment word is stored low byte first in
# RAM bytes 2n and 2n+1. Segment bits: bit0..bit5 = A..F, bit6 = G1, bit7 = G2, bit8..bit13 = H, J, K, L, M, N,
# bit14 = decimal point (Adafruit LED Backpack font).
from micropython import const

_OSC_ON = const(0x21)
_DISPLAY = const(0x80)
_DIMMING = const(0xE0)
_DP = const(0x4000)

# Glyphs for ASCII 0x20 (space) .. 0x7E (~), from Adafruit_LEDBackpack alphafonttable.
FONT = (
    0x0000, 0x0006, 0x0220, 0x12CE, 0x12ED, 0x0C24, 0x235D, 0x0400,
    0x2400, 0x0900, 0x3FC0, 0x12C0, 0x0800, 0x00C0, 0x4000, 0x0C00,
    0x0C3F, 0x0006, 0x00DB, 0x008F, 0x00E6, 0x2069, 0x00FD, 0x0007,
    0x00FF, 0x00EF, 0x1200, 0x0A00, 0x2400, 0x00C8, 0x0900, 0x1083,
    0x02BB, 0x00F7, 0x128F, 0x0039, 0x120F, 0x00F9, 0x0071, 0x00BD,
    0x00F6, 0x1209, 0x001E, 0x2470, 0x0038, 0x0536, 0x2136, 0x003F,
    0x00F3, 0x203F, 0x20F3, 0x00ED, 0x1201, 0x003E, 0x0C30, 0x2836,
    0x2D00, 0x1500, 0x0C09, 0x0039, 0x2100, 0x000F, 0x0C03, 0x0008,
    0x0100, 0x1058, 0x2078, 0x00D8, 0x088E, 0x0858, 0x0071, 0x048E,
    0x1070, 0x1000, 0x000E, 0x3600, 0x0030, 0x10D4, 0x1050, 0x00DC,
    0x0170, 0x0486, 0x0050, 0x2088, 0x0078, 0x001C, 0x2004, 0x2814,
    0x28C0, 0x200C, 0x0848, 0x0949, 0x1200, 0x2489, 0x0520,
)


class HT16K33Alpha:
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
        self._cmd(_DIMMING | max(0, min(15, int(level))))

    def blink(self, rate):
        """0 = steady, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz. Also switches the display on."""
        self._cmd(_DISPLAY | ((rate & 3) << 1) | 1)

    def off(self):
        self._cmd(_DISPLAY)

    def clear(self):
        for i in range(16):
            self.buf[i] = 0

    def raw(self, digit, mask):
        """Set digit 0..3 (left to right) to a raw 16-bit segment mask."""
        self.buf[2 * digit] = mask & 0xFF
        self.buf[2 * digit + 1] = (mask >> 8) & 0xFF

    @staticmethod
    def glyph(ch):
        c = ord(ch)
        return FONT[c - 32] if 32 <= c <= 126 else 0

    def _masks(self, s):
        masks = []
        for ch in str(s):
            if ch == '.' and masks and not masks[-1] & _DP:
                masks[-1] |= _DP      # '.' lights the previous digit's decimal point
            else:
                masks.append(self.glyph(ch))
        return masks

    def text(self, s, right=False):
        """Show up to 4 characters (left-aligned, or right-aligned with right=True) and update the display."""
        masks = self._masks(s)[:4] if not right else self._masks(s)[-4:]
        pad = [0] * (4 - len(masks))
        masks = pad + masks if right else masks + pad
        for i in range(4):
            self.raw(i, masks[i])
        self.show()

    def number(self, value, decimals=0):
        """Show a number right-aligned; shows '----' if it does not fit."""
        s = ('%.' + str(int(decimals)) + 'f') % value if decimals else '%d' % round(value)
        if len(s.replace('.', '')) > 4:
            s = '----'
        self.text(s, right=True)

    def scroll(self, s, delay_ms=300):
        """Scroll a longer message across the four digits once."""
        import time
        masks = [0] * 4 + self._masks(s) + [0] * 4
        for k in range(len(masks) - 3):
            for i in range(4):
                self.raw(i, masks[k + i])
            self.show()
            time.sleep_ms(delay_ms)

    def show(self):
        self.i2c.writeto(self.address, b'\x00' + self.buf)
