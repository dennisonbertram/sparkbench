# ILI9163C 1.44" 128x128 colour TFT (red "1.44 SPI 128*128" module, pins VCC GND CS RESET A0 SDA SCK LED),
# MicroPython driver. Written from the Ilitek ILI9163 datasheet V0.18: 4-wire SPI (mode 0, MSB first),
# A0 (D/CX) low = command, high = parameter/pixel data; 16-bit RGB565 pixels (COLMOD 0x3A = 0x05) sent
# high byte first. The chip powers up in 18-bit mode (COLMOD default 0x66), so COLMOD must be sent.
#
# This module's GM pins leave the controller in its 128x160 memory mode while the glass is only 128x128,
# so the visible picture is GRAM rows 32..159. Rotations (MADCTL bits MY MX MV ML BGR MH, the panel is BGR):
#   rotation 0: MADCTL 0x08, rows need +32      rotation 1: MADCTL 0x68, columns need +32
#   rotation 2: MADCTL 0xC8, no offset          rotation 3: MADCTL 0xA8, no offset
# (offsets as measured on this board by the TFT_ILI9163C library, "__144_RED_PCB__" settings).
# Rotation 2 is the default because it needs no offset; use rotation=0 to turn the picture 180 degrees.
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

_MADCTL = (0x08, 0x68, 0xC8, 0xA8)
_OFFSET = ((0, 32), (32, 0), (0, 0), (0, 0))  # (x, y) offset per rotation


def rgb(r, g, b):
    """24-bit colour -> RGB565."""
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


class ILI9163C:
    width = 128
    height = 128

    def __init__(self, spi, dc, cs, rst=None, rotation=2):
        self.spi = spi
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        if self.rst:
            # RESX low >= 10 us; wait 5 ms before commands and 120 ms before Sleep Out (datasheet reset timing).
            self.rst(0)
            time.sleep_ms(10)
            self.rst(1)
            time.sleep_ms(120)
        self._cmd(0x01)  # SWRESET: wait 120 ms before Sleep Out
        time.sleep_ms(150)
        self._cmd(0x11)  # SLPOUT: booster and oscillator start, wait 120 ms
        time.sleep_ms(120)
        self._cmd(0x3A, b'\x05')  # COLMOD: 16 bits per pixel (reset default 0x66 = 18-bit)
        self._cmd(0x26, b'\x04')  # GAMSET: gamma curve 3
        self._cmd(0xB1, b'\x08\x02')  # FRMCTR1: frame rate (normal mode)
        self._cmd(0xB4, b'\x07')  # INVCTR: frame inversion in all modes
        self._cmd(0xC0, b'\x0A\x02')  # PWCTR1: GVDD / VCI1
        self._cmd(0xC1, b'\x02')  # PWCTR2: AVDD, VCL, VGH, VGL step-up
        self._cmd(0xC5, b'\x50\x63')  # VMCTR1: VCOMH / VCOML
        self._cmd(0xC7, b'\x00')  # VMOFCTR: VCOM offset
        self.rotate(rotation)
        self._cmd(0x13)  # NORON: normal display mode
        self.fill(BLACK)
        self._cmd(0x29)  # DISPON
        time.sleep_ms(10)

    def rotate(self, rotation):
        r = rotation & 3
        self.xoff, self.yoff = _OFFSET[r]
        self._cmd(0x36, bytes([_MADCTL[r]]))  # MADCTL

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
        self._cmd(0x2B, bytes([y0 >> 8, y0 & 255, y1 >> 8, y1 & 255]))  # PASET

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
        # framebuf stores RGB565 low byte first; the ILI9163C wants the high byte first, so swap.
        sw = lambda c: ((c & 0xFF) << 8) | (c >> 8)
        fb.fill(sw(bg))
        fb.text(s, 0, 0, sw(colour))
        self.blit(buf, x, y, w, 8)

    def display(self, on=True):
        self._cmd(0x29 if on else 0x28)  # DISPON / DISPOFF
