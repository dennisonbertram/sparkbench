# MicroPython driver for the ILI9341 240x320 SPI colour TFT (4-line serial interface II:
# SCL, SDI, D/CX, CSX). Command sequences and timings from the Ilitek ILI9341 datasheet V1.11;
# power/gamma values from the module vendor's (LCDwiki MSP2806/MSP2807) init code.
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
    (0xCF, b'\x00\xC9\x30', 0),   # Power control B
    (0xED, b'\x64\x03\x12\x81', 0),  # Power on sequence control
    (0xE8, b'\x85\x10\x7A', 0),   # Driver timing control A
    (0xCB, b'\x39\x2C\x00\x34\x02', 0),  # Power control A
    (0xF7, b'\x20', 0),           # Pump ratio control
    (0xEA, b'\x00\x00', 0),       # Driver timing control B
    (0xC0, b'\x1B', 0),           # Power control 1 (VRH)
    (0xC1, b'\x00', 0),           # Power control 2
    (0xC5, b'\x30\x30', 0),       # VCOM control 1
    (0xC7, b'\xB7', 0),           # VCOM control 2
    (0x3A, b'\x55', 0),           # Pixel format: 16 bits/pixel (default is 18)
    (0xB1, b'\x00\x1A', 0),       # Frame rate control
    (0xB6, b'\x0A\xA2', 0),       # Display function control
    (0xF2, b'\x00', 0),           # 3-gamma off
    (0x26, b'\x01', 0),           # Gamma curve 1
    (0xE0, b'\x0F\x2A\x28\x08\x0E\x08\x54\xA9\x43\x0A\x0F\x00\x00\x00\x00', 0),
    (0xE1, b'\x00\x15\x17\x07\x11\x06\x2B\x56\x3C\x05\x10\x0F\x3F\x3F\x0F', 0),
    (0x11, b'', 120),             # Sleep out: wait 120 ms (datasheet 8.2.12)
    (0x29, b'', 0),               # Display on
)


class ILI9341:
    # MADCTL (36h): BGR panel; rotation 0/2 portrait 240x320, 1/3 landscape 320x240 (MV set).
    _MADCTL = (0x08, 0x68, 0xC8, 0xA8)

    def __init__(self, spi, dc, cs, rst=None, rotation=0):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        if rst is not None:
            self.rst = Pin(rst, Pin.OUT, value=1)
            time.sleep_ms(5)
            self.rst(0)
            time.sleep_ms(1)          # tRW >= 10 us
            self.rst(1)
            time.sleep_ms(120)        # >= 5 ms before commands, 120 ms before Sleep Out
        self._cmd(0x01)               # software reset
        time.sleep_ms(120)
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
        self.width, self.height = (240, 320) if r in (0, 2) else (320, 240)
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
        """8x8 font text. framebuf stores RGB565 little-endian, the ILI9341 wants MSB first,
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
