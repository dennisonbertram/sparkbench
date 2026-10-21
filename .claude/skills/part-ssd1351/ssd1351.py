# SSD1351 1.5" 128x128 colour OLED (Waveshare 1.5inch RGB OLED Module), MicroPython driver.
# Written from the Solomon Systech SSD1351 Rev 1.5 datasheet and the panel's application example:
# 4-wire SPI (mode 0, MSB first, clock cycle >= 220 ns so <= 4.5 MHz), D/C low = command byte,
# D/C high = its parameters and pixel data. 65k-colour mode: RGB565, 2 bytes per pixel, high byte first.
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

WIDTH = 128
HEIGHT = 128


def rgb(r, g, b):
    """24-bit colour -> RGB565."""
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


class SSD1351:
    def __init__(self, spi, dc, cs, rst=None):
        self.spi = spi
        self.width, self.height = WIDTH, HEIGHT
        self.dc = Pin(dc, Pin.OUT, value=1)
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        if self.rst:
            # RES# low for at least 2 us resets the chip (datasheet 8.9 / Table 13-1).
            time.sleep_ms(1)
            self.rst(0)
            time.sleep_ms(1)
            self.rst(1)
        # Datasheet 8.9: wait at least 300 ms after VCI is stable before sending commands.
        time.sleep_ms(300)
        self._cmd(0xFD, b'\x12')  # command lock: unlock the MCU interface
        self._cmd(0xFD, b'\xB1')  # make A2/B1/B3/BB/BE/C1 accessible
        self._cmd(0xAE)  # sleep mode on (display off) while configuring
        self._cmd(0xB3, b'\xF1')  # front clock divider /2, oscillator frequency 0xF
        self._cmd(0xCA, b'\x7F')  # multiplex ratio 128
        self._cmd(0xA2, b'\x00')  # display offset 0
        self._cmd(0xA1, b'\x00')  # display start line 0
        # Re-map / colour depth 0x74: horizontal increment, column 0 -> SEG0, colour order C-B-A
        # (red in the top bits of RGB565), COM scan COM127 -> COM0, COM split odd/even, 65k colours.
        # Same orientation bits as the panel maker's example (0xB4), but 16-bit pixels.
        self._cmd(0xA0, b'\x74')
        self._cmd(0xB5, b'\x00')  # GPIO0/1 high impedance, input disabled
        self._cmd(0xAB, b'\x01')  # function selection: internal VDD regulator on
        self._cmd(0xB4, b'\xA0\xB5\x55')  # segment low voltage: external VSL
        self._cmd(0xC1, b'\xC8\x80\xC8')  # contrast current for colours A, B, C
        self._cmd(0xC7, b'\x0F')  # master contrast: full
        self._cmd(0xB1, b'\x32')  # phase 1 = 5 DCLKs, phase 2 = 3 DCLKs
        self._cmd(0xB2, b'\xA4\x00\x00')  # display enhancement
        self._cmd(0xBB, b'\x17')  # pre-charge voltage
        self._cmd(0xB6, b'\x01')  # second pre-charge period 1 DCLK
        self._cmd(0xBE, b'\x05')  # VCOMH 0.82 x VCC
        self._cmd(0xA6)  # normal display mode
        self.fill(BLACK)  # clear the RAM before switching on (panel power-up sequence)
        self._cmd(0xAF)  # sleep mode off (display on); SEG/COM come on within 200 ms
        time.sleep_ms(200)

    def _cmd(self, c, data=b''):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes([c]))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def _window(self, x, y, w, h):
        self._cmd(0x15, bytes([x, x + w - 1]))  # set column address (start, end)
        self._cmd(0x75, bytes([y, y + h - 1]))  # set row address (start, end)

    def blit(self, buf, x, y, w, h):
        """Write w*h big-endian RGB565 pixels (2 bytes each) at (x, y)."""
        self._window(x, y, w, h)
        self._cmd(0x5C, buf)  # write RAM

    def fill_rect(self, x, y, w, h, colour):
        x, y = max(0, x), max(0, y)
        w, h = min(w, self.width - x), min(h, self.height - y)
        if w <= 0 or h <= 0:
            return
        self._window(x, y, w, h)
        line = bytes([colour >> 8, colour & 255]) * w
        self.cs(0)
        self.dc(0)
        self.spi.write(b'\x5C')
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
        # framebuf stores RGB565 low byte first; the SSD1351 wants the high byte first, so swap.
        sw = lambda c: ((c & 0xFF) << 8) | (c >> 8)
        fb.fill(sw(bg))
        fb.text(s, 0, 0, sw(colour))
        self.blit(buf, x, y, w, 8)

    def contrast(self, level):
        """Master contrast 0..15 (command C7h)."""
        self._cmd(0xC7, bytes([level & 0x0F]))

    def invert(self, on=True):
        self._cmd(0xA7 if on else 0xA6)

    def display(self, on=True):
        self._cmd(0xAF if on else 0xAE)  # sleep mode off / on
