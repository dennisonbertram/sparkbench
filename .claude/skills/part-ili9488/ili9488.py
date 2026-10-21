# MicroPython driver for the ILI9488 320x480 TFT over the 4-line serial interface
# (DBI type C option 3: SCL, SDA, D/CX, CSX). From the ILITEK ILI9488 datasheet V1.00:
# in SPI mode the chip only accepts 3 or 18 bits/pixel (section 4.7, no RGB565), so pixels are
# sent as 3 bytes R, G, B with the 6 colour bits in D7..D2. COLMOD (3Ah) resets to 06h = 18-bit.
# Power/gamma values from the module vendor's (LCDwiki MSP3520/MSP3521) init code.
from machine import Pin
import framebuf
import time

# Colours are given as RGB565 for convenience and expanded to RGB666 when sent.
BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0
CYAN = 0x07FF
MAGENTA = 0xF81F


def rgb565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def _666(c):
    # RGB565 -> the three SPI bytes (R5..R0, G5..G0, B5..B0 in bits 7..2)
    return bytes(((c >> 8) & 0xF8, (c >> 3) & 0xFC, (c << 3) & 0xF8))


# (command, parameters, delay ms after)
_INIT = (
    (0xF7, b'\xA9\x51\x2C\x82', 0),   # Adjust control 3 (vendor value)
    (0xC0, b'\x11\x09', 0),           # Power control 1: VREG1OUT / VREG2OUT
    (0xC1, b'\x41', 0),               # Power control 2: step-up factor
    (0xC5, b'\x00\x0A\x80', 0),       # VCOM control
    (0xB1, b'\xB0\x11', 0),           # Frame rate control (normal mode)
    (0xB4, b'\x02', 0),               # Display inversion control: 2-dot
    (0xB6, b'\x02\x42', 0),           # Display function control
    (0xB7, b'\xC6', 0),               # Entry mode set
    (0xBE, b'\x00\x04', 0),           # HS lanes control (vendor value)
    (0xE9, b'\x00', 0),               # Set image function: 24-bit data bus off
    (0x3A, b'\x66', 0),               # COLMOD: 18 bits/pixel (the only full-colour SPI format)
    (0xE0, b'\x00\x07\x10\x09\x17\x0B\x41\x89\x4B\x0A\x0C\x0E\x18\x1B\x0F', 0),  # +gamma
    (0xE1, b'\x00\x17\x1A\x04\x0E\x06\x2F\x45\x43\x02\x0A\x09\x32\x36\x0F', 0),  # -gamma
    (0x11, b'', 120),                 # Sleep out: wait 120 ms (datasheet 5.2.12)
    (0x29, b'', 0),                   # Display on
)


class ILI9488:
    # MADCTL (36h) from the vendor code for this panel, BGR bit set.
    # rotation 0/2 portrait 320x480, 1/3 landscape 480x320 (MV set).
    _MADCTL = (0x08, 0x68, 0xC8, 0xA8)

    def __init__(self, spi, dc, cs, rst=None, rotation=0):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        if rst is not None:
            self.rst = Pin(rst, Pin.OUT, value=1)
            time.sleep_ms(5)
            self.rst(0)
            time.sleep_ms(10)         # tRW >= 10 us
            self.rst(1)
            time.sleep_ms(120)        # 5 ms register load; 120 ms before Sleep Out
        self._cmd(0x01)               # software reset
        time.sleep_ms(120)            # >= 5 ms; 120 ms before Sleep Out
        for c, a, d in _INIT:
            self._cmd(c, a)
            if d:
                time.sleep_ms(d)
        self.rotation(rotation)

    def _cmd(self, c, data=b''):
        self.cs(0)
        self.dc(0)                    # D/CX low = command
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)                # D/CX high = parameter / pixel data
            self.spi.write(data)
        self.cs(1)

    def rotation(self, r):
        r &= 3
        self.width, self.height = (320, 480) if r in (0, 2) else (480, 320)
        self._cmd(0x36, bytes([self._MADCTL[r]]))

    def _window(self, x, y, w, h):
        x1, y1 = x + w - 1, y + h - 1
        self._cmd(0x2A, bytes([x >> 8, x & 255, x1 >> 8, x1 & 255]))
        self._cmd(0x2B, bytes([y >> 8, y & 255, y1 >> 8, y1 & 255]))

    def blit666(self, buf, x, y, w, h):
        """Write w*h pixels of 3 bytes (R, G, B, 6 bits each in bits 7..2) at (x, y)."""
        self._window(x, y, w, h)
        self._cmd(0x2C, buf)

    def fill_rect(self, x, y, w, h, colour):
        self._window(x, y, w, h)
        line = _666(colour) * w
        self.cs(0)
        self.dc(0)
        self.spi.write(b'\x2C')
        self.dc(1)
        for _ in range(h):
            self.spi.write(line)
        self.cs(1)

    def fill(self, colour):
        self.fill_rect(0, 0, self.width, self.height, colour)

    def pixel(self, x, y, colour):
        self.blit666(_666(colour), x, y, 1, 1)

    def text(self, s, x, y, colour=WHITE, bg=BLACK):
        """8x8 font text, expanded to 18-bit pixels."""
        w = 8 * len(s)
        mono = bytearray(w)            # w x 8 bits, MONO_HLSB
        fb = framebuf.FrameBuffer(mono, w, 8, framebuf.MONO_HLSB)
        fb.text(s, 0, 0, 1)
        fg, bk = _666(colour), _666(bg)
        buf = bytearray(w * 8 * 3)
        i = 0
        for yy in range(8):
            for xx in range(w):
                buf[i:i + 3] = fg if fb.pixel(xx, yy) else bk
                i += 3
        self.blit666(buf, x, y, w, 8)

    def off(self):
        self._cmd(0x28)

    def on(self):
        self._cmd(0x29)
