# GC9A01 240x240 round IPS TFT driver (4-line SPI, write-only).
# Command set from the Galaxycore GC9A01 datasheet V1.0; the panel set-up table is the
# manufacturer's initialisation sequence (as used by Waveshare / Adafruit_GC9A01A).
from machine import Pin
import framebuf
import time

_INIT = (
    (0xEF, b''), (0xEB, b'\x14'), (0xFE, b''), (0xEF, b''), (0xEB, b'\x14'),
    (0x84, b'\x40'), (0x85, b'\xff'), (0x86, b'\xff'), (0x87, b'\xff'), (0x88, b'\x0a'),
    (0x89, b'\x21'), (0x8A, b'\x00'), (0x8B, b'\x80'), (0x8C, b'\x01'), (0x8D, b'\x01'),
    (0x8E, b'\xff'), (0x8F, b'\xff'), (0xB6, b'\x00\x00'),
    (0x36, b'\x48'),                      # MADCTL: MX + BGR (upright on the round panel)
    (0x3A, b'\x05'),                      # COLMOD: 16 bits/pixel (RGB565) on the MCU interface
    (0x90, b'\x08\x08\x08\x08'), (0xBD, b'\x06'), (0xBC, b'\x00'), (0xFF, b'\x60\x01\x04'),
    (0xC3, b'\x13'), (0xC4, b'\x13'), (0xC9, b'\x22'), (0xBE, b'\x11'), (0xE1, b'\x10\x0e'),
    (0xDF, b'\x21\x0c\x02'),
    (0xF0, b'\x45\x09\x08\x08\x26\x2a'), (0xF1, b'\x43\x70\x72\x36\x37\x6f'),
    (0xF2, b'\x45\x09\x08\x08\x26\x2a'), (0xF3, b'\x43\x70\x72\x36\x37\x6f'),
    (0xED, b'\x1b\x0b'), (0xAE, b'\x77'), (0xCD, b'\x63'), (0xE8, b'\x34'),
    (0x62, b'\x18\x0d\x71\xed\x70\x70\x18\x0f\x71\xef\x70\x70'),
    (0x63, b'\x18\x11\x71\xf1\x70\x70\x18\x13\x71\xf3\x70\x70'),
    (0x64, b'\x28\x29\xf1\x01\xf1\x00\x07'),
    (0x66, b'\x3c\x00\xcd\x67\x45\x45\x10\x00\x00\x00'),
    (0x67, b'\x00\x3c\x00\x00\x00\x01\x54\x10\x32\x98'),
    (0x74, b'\x10\x85\x80\x00\x00\x4e\x00'), (0x98, b'\x3e\x07'),
    (0x35, b''),                          # tearing effect line on
    (0x21, b''),                          # display inversion on (IPS panel)
)

BLACK = 0x0000
WHITE = 0xFFFF
RED = 0xF800
GREEN = 0x07E0
BLUE = 0x001F
YELLOW = 0xFFE0


class GC9A01:
    def __init__(self, spi, dc, cs, rst, width=240, height=240):
        self.spi, self.width, self.height = spi, width, height
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1)
        # Hardware reset (RESX active low), then wait 120 ms before sending commands.
        self.rst(0)
        time.sleep_ms(10)
        self.rst(1)
        time.sleep_ms(120)
        for c, a in _INIT:
            self._cmd(c, a)
        self._cmd(0x11)          # Sleep Out: wait 120 ms (datasheet 6.2.4)
        time.sleep_ms(120)
        self._cmd(0x29)          # Display ON
        time.sleep_ms(20)

    def _cmd(self, c, data=b''):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def _window(self, x0, y0, x1, y1):
        self._cmd(0x2A, bytes([x0 >> 8, x0 & 255, x1 >> 8, x1 & 255]))  # CASET
        self._cmd(0x2B, bytes([y0 >> 8, y0 & 255, y1 >> 8, y1 & 255]))  # RASET

    def blit(self, buf, x, y, w, h):
        """Write w*h RGB565 pixels (2 bytes each, high byte first) at x, y."""
        self._window(x, y, x + w - 1, y + h - 1)
        self._cmd(0x2C, buf)                                           # RAMWR

    def fill_rect(self, x, y, w, h, colour):
        self._window(x, y, x + w - 1, y + h - 1)
        line = bytes([colour >> 8, colour & 255]) * w
        self.cs(0)
        self.dc(0)
        self.spi.write(b'\x2c')
        self.dc(1)
        for _ in range(h):
            self.spi.write(line)
        self.cs(1)

    def fill(self, colour):
        self.fill_rect(0, 0, self.width, self.height, colour)

    def text(self, s, x, y, colour=WHITE, bg=BLACK):
        """8x8 font text. RGB565 goes on the wire high byte first, so swap bytes for framebuf."""
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
