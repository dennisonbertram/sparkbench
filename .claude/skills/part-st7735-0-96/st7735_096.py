# ST7735S 0.96" 80x160 IPS colour TFT (LCDwiki/QDtech MSP0961 module), MicroPython driver.
# Written from the Sitronix ST7735S V1.1 datasheet and the module maker's init code:
# 4-wire SPI (mode 0), D/C low = command, 16-bit RGB565 pixels (COLMOD 0x3A = 0x05),
# sent most-significant byte first.
# The IPS glass needs Display Inversion On (0x21) and is wired BGR (MADCTL bit 3).
# The ST7735S RAM is 132x162 but the glass is 80x160, centred in it: the visible area starts at
# RAM column 26, row 1 in portrait (column 1, row 26 in landscape). Because the glass is centred,
# the offsets stay the same when the picture is mirrored (MX/MY).
from machine import Pin
import framebuf
import time

BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0
CYAN = 0x07FF


def rgb(r, g, b):
    """24-bit colour -> RGB565."""
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


class ST7735:
    def __init__(self, spi, dc, cs, rst=None, landscape=False):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        if landscape:
            self.width, self.height = 160, 80
            self.xoff, self.yoff = 1, 26
            madctl = 0xA8  # MY + MV (row/column exchange) + BGR
        else:
            self.width, self.height = 80, 160
            self.xoff, self.yoff = 26, 1
            madctl = 0xC8  # MY + MX + BGR (maker's 0-degree orientation)
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
        self._cmd(0x21)  # INVON: the IPS panel needs inverted data
        self._cmd(0xB1, b'\x05\x3A\x3A')  # FRMCTR1 frame rate (normal mode)
        self._cmd(0xB2, b'\x05\x3A\x3A')  # FRMCTR2 (idle mode)
        self._cmd(0xB3, b'\x05\x3A\x3A\x05\x3A\x3A')  # FRMCTR3 (partial mode)
        self._cmd(0xB4, b'\x03')  # INVCTR: dot inversion
        self._cmd(0xC0, b'\x62\x02\x04')  # PWCTR1
        self._cmd(0xC1, b'\xC0')  # PWCTR2
        self._cmd(0xC2, b'\x0D\x00')  # PWCTR3 (normal mode)
        self._cmd(0xC3, b'\x8D\x6A')  # PWCTR4 (idle mode)
        self._cmd(0xC4, b'\x8D\xEE')  # PWCTR5 (partial mode)
        self._cmd(0xC5, b'\x0E')  # VMCTR1: VCOM
        self._cmd(0xE0, b'\x10\x0E\x02\x03\x0E\x07\x02\x07\x0A\x12\x27\x37\x00\x0D\x0E\x10')  # gamma +
        self._cmd(0xE1, b'\x10\x0E\x03\x03\x0F\x06\x02\x08\x0A\x13\x26\x36\x00\x0D\x0E\x10')  # gamma -
        self._cmd(0x3A, b'\x05')  # COLMOD: 16 bits per pixel
        self._cmd(0x36, bytes([madctl]))  # MADCTL: scan direction, BGR order
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
        """Draw text with MicroPython's built-in 8x8 font (10 characters per line in portrait)."""
        s = s[:max(0, self.width - x) // 8]
        if not s or y < 0 or y + 8 > self.height:
            return
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
