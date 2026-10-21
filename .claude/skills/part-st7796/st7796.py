# MicroPython driver for the ST7796S 320x480 SPI colour TFT (4-line serial interface:
# SCL, SDA, D/CX, CSX). Command sequences and timings from the Sitronix ST7796S datasheet V1.0;
# power/gamma values from the module vendor's (LCDwiki MSP4020/MSP4021) init code.
from machine import Pin
import framebuf
import time

BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0


def rgb565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


# (command, parameters, delay ms after)
_INIT = (
    (0xF0, b'\xC3', 0),           # CSCON: enable command 2 part I
    (0xF0, b'\x96', 0),           # CSCON: enable command 2 part II
    (0x3A, b'\x55', 0),           # COLMOD: 16 bits/pixel (H/W reset default is 18)
    (0xB0, b'\x80', 0),           # Interface mode control
    (0xB6, b'\x00\x02', 0),       # Display function control
    (0xB5, b'\x02\x03\x00\x04', 0),  # Blanking porch control
    (0xB1, b'\x80\x10', 0),       # Frame rate control
    (0xB4, b'\x00', 0),           # Display inversion control (column)
    (0xB7, b'\xC6', 0),           # Entry mode set
    (0xC5, b'\x24', 0),           # VCOM control
    (0xE4, b'\x31', 0),
    (0xE8, b'\x40\x8A\x00\x00\x29\x19\xA5\x33', 0),  # Display output ctrl adjust
    (0xC2, b'', 0),               # Power control 3 (vendor sends command only)
    (0xA7, b'', 0),
    (0xE0, b'\xF0\x09\x13\x12\x12\x2B\x3C\x44\x4B\x1B\x18\x17\x1D\x21', 0),  # +gamma
    (0xE1, b'\xF0\x09\x13\x0C\x0D\x27\x3B\x44\x4D\x0B\x17\x17\x1D\x21', 0),  # -gamma
    (0xF0, b'\x3C', 0),           # CSCON: disable command 2 part I
    (0xF0, b'\x69', 0),           # CSCON: disable command 2 part II
    (0x13, b'', 0),               # Normal display mode on
    (0x11, b'', 120),             # Sleep out: wait 120 ms (datasheet 9.2.13)
    (0x29, b'', 0),               # Display on
)


class ST7796:
    # MADCTL (36h): BGR panel. rotation 0/2 portrait 320x480, 1/3 landscape 480x320 (MV set).
    _MADCTL = (0x48, 0x28, 0x88, 0xE8)

    def __init__(self, spi, dc, cs, rst=None, rotation=0):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        if rst is not None:
            self.rst = Pin(rst, Pin.OUT, value=1)
            time.sleep_ms(5)
            self.rst(0)
            time.sleep_ms(10)
            self.rst(1)
            time.sleep_ms(120)        # >= 5 ms before commands, 120 ms before Sleep Out
        self._cmd(0x01)               # software reset
        time.sleep_ms(120)            # 5 ms minimum; 120 ms before Sleep Out
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

    def blit(self, buf, x, y, w, h):
        """Write w*h big-endian RGB565 pixels from buf at (x, y)."""
        self._window(x, y, w, h)
        self._cmd(0x2C, buf)

    def fill_rect(self, x, y, w, h, colour):
        self._window(x, y, w, h)
        line = bytes([colour >> 8, colour & 255]) * w
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
        self.blit(bytes([colour >> 8, colour & 255]), x, y, 1, 1)

    def text(self, s, x, y, colour=WHITE, bg=BLACK):
        """8x8 font text. framebuf stores RGB565 little-endian, the ST7796S wants MSB first,
        so colours are byte-swapped before drawing."""
        w = 8 * len(s)
        buf = bytearray(w * 8 * 2)
        fb = framebuf.FrameBuffer(buf, w, 8, framebuf.RGB565)
        sw = lambda c: ((c & 255) << 8) | (c >> 8)
        fb.fill(sw(bg))
        fb.text(s, 0, 0, sw(colour))
        self.blit(buf, x, y, w, 8)

    def off(self):
        self._cmd(0x28)

    def on(self):
        self._cmd(0x29)
