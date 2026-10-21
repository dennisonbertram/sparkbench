# ST7735S 1.8" 128x160 colour TFT (Waveshare 1.8inch LCD Module), MicroPython driver.
# Written from the Sitronix ST7735S V1.1 datasheet: 4-wire SPI (mode 0), D/C low = command,
# 16-bit RGB565 pixels (COLMOD 0x3A = 0x05), sent most-significant byte first.
# The panel is 128x160 but the ST7735S RAM is 132x162, so on this module the visible area
# starts at RAM column 2, row 1 (portrait). In landscape the two offsets swap.
from machine import Pin
import framebuf
import time

BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0


def rgb(r, g, b):
    """24-bit colour -> RGB565."""
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


class ST7735:
    def __init__(self, spi, dc, cs, rst=None, landscape=False, xoff=2, yoff=1):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        if landscape:
            self.width, self.height = 160, 128
            self.xoff, self.yoff = yoff, xoff
            madctl = 0x60  # MV (row/column exchange) + MX
        else:
            self.width, self.height = 128, 160
            self.xoff, self.yoff = xoff, yoff
            madctl = 0x00  # MY=MX=MV=0, RGB order
        if self.rst:
            # RESX low >= 10 us resets the chip; wait 120 ms before Sleep Out (datasheet 9.15).
            self.rst(0)
            time.sleep_ms(10)
            self.rst(1)
            time.sleep_ms(120)
        self._cmd(0x01)  # SWRESET: wait 120 ms before the next command
        time.sleep_ms(150)
        self._cmd(0x11)  # SLPOUT: booster and oscillator start, wait 120 ms
        time.sleep_ms(120)
        self._cmd(0xB1, b'\x01\x2C\x2D')  # FRMCTR1 frame rate (normal mode)
        self._cmd(0xB2, b'\x01\x2C\x2D')  # FRMCTR2 (idle mode)
        self._cmd(0xB3, b'\x01\x2C\x2D\x01\x2C\x2D')  # FRMCTR3 (partial mode)
        self._cmd(0xB4, b'\x07')  # INVCTR: column inversion
        self._cmd(0xC0, b'\xA2\x02\x84')  # PWCTR1: AVDD 5.0 V, GVDD 4.6 V, AUTO mode
        self._cmd(0xC1, b'\xC5')  # PWCTR2: VGH/VGL
        self._cmd(0xC2, b'\x0A\x00')  # PWCTR3 (normal mode)
        self._cmd(0xC3, b'\x8A\x2A')  # PWCTR4 (idle mode)
        self._cmd(0xC4, b'\x8A\xEE')  # PWCTR5 (partial mode)
        self._cmd(0xC5, b'\x0E')  # VMCTR1: VCOM
        self._cmd(0xE0, b'\x0F\x1A\x0F\x18\x2F\x28\x20\x22\x1F\x1B\x23\x37\x00\x07\x02\x10')  # gamma +
        self._cmd(0xE1, b'\x0F\x1B\x0F\x17\x33\x2C\x29\x2E\x30\x30\x39\x3F\x00\x07\x03\x10')  # gamma -
        self._cmd(0x3A, b'\x05')  # COLMOD: 16 bits per pixel
        self._cmd(0x36, bytes([madctl]))  # MADCTL: scan direction / orientation
        self._cmd(0x13)  # NORON: normal display mode
        self.fill(BLACK)
        self._cmd(0x29)  # DISPON
        time.sleep_ms(10)

    def _cmd(self, c, data=b''):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def _window(self, x, y, w, h):
        x0, y0 = x + self.xoff, y + self.yoff
        x1, y1 = x0 + w - 1, y0 + h - 1
        self._cmd(0x2A, bytes([x0 >> 8, x0 & 255, x1 >> 8, x1 & 255]))  # CASET
        self._cmd(0x2B, bytes([y0 >> 8, y0 & 255, y1 >> 8, y1 & 255]))  # RASET

    def blit(self, buf, x, y, w, h):
        """Write w*h big-endian RGB565 pixels (2 bytes each) at (x, y)."""
        self._window(x, y, w, h)
        self._cmd(0x2C, buf)  # RAMWR

    def fill_rect(self, x, y, w, h, colour):
        x, y = max(0, x), max(0, y)
        w, h = min(w, self.width - x), min(h, self.height - y)
        if w <= 0 or h <= 0:
            return
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
        self.fill_rect(x, y, 1, 1, colour)

    def text(self, s, x, y, colour=WHITE, bg=BLACK):
        """Draw text with MicroPython's built-in 8x8 font."""
        w = 8 * len(s)
        buf = bytearray(w * 8 * 2)
        fb = framebuf.FrameBuffer(buf, w, 8, framebuf.RGB565)
        # framebuf stores RGB565 little-endian; the ST7735 wants the high byte first, so swap.
        sw = lambda c: ((c & 0xFF) << 8) | (c >> 8)
        fb.fill(sw(bg))
        fb.text(s, 0, 0, sw(colour))
        self.blit(buf, x, y, w, 8)

    def display(self, on=True):
        self._cmd(0x29 if on else 0x28)  # DISPON / DISPOFF
