# SSD1309 128x64 OLED on 4-wire SPI (e.g. LCDwiki / QDtech MSP242X 2.42" SPI&IIC module), MicroPython driver.
# Written from the Solomon Systech SSD1309 datasheet Rev 1.1 and the module maker's init sequence.
# 4-wire SPI (datasheet 8.1.3): write only, MSB first, data sampled on SCLK rising edge,
# D/C# low = command byte, high = GDDRAM data; CS# active low. SCLK cycle >= 100 ns (<= 10 MHz).
# The SSD1309 has no internal charge pump (no 8Dh command): the module's boost converter makes VCC.
import framebuf
import time


class SSD1309_SPI(framebuf.FrameBuffer):
    def __init__(self, width, height, spi, dc, res, cs, baudrate=8_000_000):
        self.width = width
        self.height = height
        self.spi = spi
        self.dc = dc
        self.res = res
        self.cs = cs
        self.rate = baudrate
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        dc.init(dc.OUT, value=0)
        cs.init(cs.OUT, value=1)
        res.init(res.OUT, value=1)
        # Power ON sequence (datasheet 8.8): after VDD is stable hold RES# low >= 3 us, then high.
        time.sleep_ms(1)
        res(0)
        time.sleep_ms(1)
        res(1)
        time.sleep_ms(1)
        self.init_display()

    def _write(self, dc, buf):
        self.spi.init(baudrate=self.rate, polarity=0, phase=0)
        self.cs(1)
        self.dc(dc)
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)

    def cmd(self, *b):
        self._write(0, bytes(b))

    def init_display(self):
        self.cmd(0xAE)                    # display off
        self.cmd(0xFD, 0x12)              # command lock off (unlocked; reset state)
        self.cmd(0xD5, 0xA0)              # clock divide 1, oscillator setting 1010b (module maker's value)
        self.cmd(0xA8, self.height - 1)   # multiplex ratio
        self.cmd(0xD3, 0x00)              # display offset 0
        self.cmd(0x40)                    # start line 0
        self.cmd(0x20, 0x00)              # horizontal addressing mode
        self.cmd(0xA1)                    # column 127 -> SEG0 (panel mounted mirrored)
        self.cmd(0xC8)                    # COM scan COM[N-1] -> COM0
        self.cmd(0xDA, 0x12)              # alternative COM pin configuration
        self.cmd(0x81, 0xBF)              # contrast
        self.cmd(0xD9, 0xF1)              # pre-charge phase 1 = 1 DCLK, phase 2 = 15 DCLK
        self.cmd(0xDB, 0x34)              # VCOMH ~0.78 x VCC (reset value)
        self.cmd(0xA4)                    # display follows RAM
        self.cmd(0xA6)                    # normal (not inverted)
        self.fill(0)
        self.show()
        self.cmd(0xAF)                    # display on (SEG/COM on after 100 ms)

    def poweroff(self):
        self.cmd(0xAE)

    def poweron(self):
        self.cmd(0xAF)

    def contrast(self, c):
        self.cmd(0x81, c & 0xFF)

    def invert(self, on):
        self.cmd(0xA7 if on else 0xA6)

    def show(self):
        self.cmd(0x21, 0, self.width - 1)   # column range
        self.cmd(0x22, 0, self.pages - 1)   # page range
        self._write(1, self.buffer)
