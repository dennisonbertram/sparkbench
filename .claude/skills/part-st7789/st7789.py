# ST7789 / ST7789VW colour TFT controller (Sitronix), MicroPython SPI driver for the common
# 1.3" 240x240 IPS module with a 7-pin header GND VCC SCL SDA RES DC BLK (CS tied low on the board).
# From the ST7789VW datasheet V1.0:
#   4-line serial: D/CX low = command byte, high = parameter/pixel bytes, MSB first.
#   Write clock cycle >= 16 ns (max ~62 MHz). With CS tied low these modules need SPI mode 3
#   (polarity=1, phase=1), so build the bus as SPI(..., polarity=1, phase=1).
#   RESX low >= 10 us, then wait 120 ms (reset cancel) before Sleep Out.
#   SWRESET (01h): wait 5 ms, and 120 ms before SLPOUT. SLPOUT (11h): wait 120 ms before SLPIN,
#   and 5 ms before the next command.
#   COLMOD (3Ah) = 55h: 16 bit/pixel RGB565. MADCTL (36h) sets orientation. INVON (21h): IPS panels
#   on these modules need inversion on to show true colours. NORON (13h), DISPON (29h).
#   CASET (2Ah) / RASET (2Bh): start and end address, 16-bit each, MSB first. RAMWR (2Ch): pixels.
# The controller has 240x320 RAM; the 240x240 panel shows RAM rows 0-239, so rotations 180/270
# need an 80-pixel offset.
from machine import Pin
import framebuf
import time

_SWRESET = 0x01
_SLPOUT = 0x11
_NORON = 0x13
_INVON = 0x21
_DISPOFF = 0x28
_DISPON = 0x29
_CASET = 0x2A
_RASET = 0x2B
_RAMWR = 0x2C
_MADCTL = 0x36
_COLMOD = 0x3A

# rotation -> (MADCTL, x offset, y offset) for a 240x240 panel on 240x320 RAM
_ROT = ((0x00, 0, 0), (0x60, 0, 0), (0xC0, 0, 80), (0xA0, 80, 0))

BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0


def color565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


class ST7789:
    def __init__(self, spi, dc, rst=None, cs=None, blk=None, width=240, height=240, rotation=0):
        # spi: machine.SPI built with polarity=1, phase=1 for the CS-less 7-pin module.
        # dc, rst, cs, blk: GPIO numbers (cs/blk None when not wired).
        self.spi = spi
        self.width = width
        self.height = height
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        self.cs = Pin(cs, Pin.OUT, value=1) if cs is not None else None
        self.blk = Pin(blk, Pin.OUT, value=1) if blk is not None else None
        self._xo = 0
        self._yo = 0
        self.reset()
        self._cmd(_SWRESET)
        time.sleep_ms(150)          # 5 ms after SWRESET, 120 ms before SLPOUT
        self._cmd(_SLPOUT)
        time.sleep_ms(120)          # sleep out settles in 120 ms
        self._cmd(_COLMOD, b'\x55')  # 16 bit/pixel
        time.sleep_ms(10)
        self.rotation(rotation)
        self._cmd(_INVON)
        time.sleep_ms(10)
        self._cmd(_NORON)
        time.sleep_ms(10)
        self.fill(BLACK)
        self._cmd(_DISPON)
        time.sleep_ms(10)

    def reset(self):
        if self.rst is None:
            return
        self.rst(1)
        time.sleep_ms(5)
        self.rst(0)
        time.sleep_ms(1)            # >= 10 us low
        self.rst(1)
        time.sleep_ms(120)          # reset cancel time

    def _cmd(self, c, data=None):
        if self.cs:
            self.cs(0)
        self.dc(0)
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)
            self.spi.write(data)
        if self.cs:
            self.cs(1)

    def _data(self, buf):
        if self.cs:
            self.cs(0)
        self.dc(1)
        self.spi.write(buf)
        if self.cs:
            self.cs(1)

    def rotation(self, r):
        mad, self._xo, self._yo = _ROT[r & 3]
        self._cmd(_MADCTL, bytes([mad]))

    def window(self, x0, y0, x1, y1):
        x0 += self._xo
        x1 += self._xo
        y0 += self._yo
        y1 += self._yo
        self._cmd(_CASET, bytes([x0 >> 8, x0 & 0xFF, x1 >> 8, x1 & 0xFF]))
        self._cmd(_RASET, bytes([y0 >> 8, y0 & 0xFF, y1 >> 8, y1 & 0xFF]))
        self._cmd(_RAMWR)

    def fill_rect(self, x, y, w, h, color):
        if w <= 0 or h <= 0:
            return
        self.window(x, y, x + w - 1, y + h - 1)
        line = bytes([color >> 8, color & 0xFF]) * w
        for _ in range(h):          # one row at a time keeps RAM use small
            self._data(line)

    def fill(self, color):
        self.fill_rect(0, 0, self.width, self.height, color)

    def pixel(self, x, y, color):
        self.window(x, y, x, y)
        self._data(bytes([color >> 8, color & 0xFF]))

    def blit_buffer(self, buf, x, y, w, h):
        # buf: w*h RGB565 pixels, high byte first (the order the ST7789 expects).
        self.window(x, y, x + w - 1, y + h - 1)
        self._data(buf)

    def text(self, s, x, y, color=WHITE, background=BLACK):
        # 8x8 framebuf font. framebuf stores RGB565 little-endian, so swap the bytes of each colour
        # to get the high byte first on the wire.
        w = 8 * len(s)
        buf = bytearray(w * 8 * 2)
        fb = framebuf.FrameBuffer(buf, w, 8, framebuf.RGB565)
        sw = lambda c: ((c & 0xFF) << 8) | (c >> 8)
        fb.fill(sw(background))
        fb.text(s, 0, 0, sw(color))
        self.blit_buffer(buf, x, y, w, 8)

    def on(self):
        self._cmd(_DISPON)
        if self.blk:
            self.blk(1)

    def off(self):
        self._cmd(_DISPOFF)
        if self.blk:
            self.blk(0)
