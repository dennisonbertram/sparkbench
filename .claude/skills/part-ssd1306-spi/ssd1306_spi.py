# SSD1306 0.96" 128x64 OLED on 4-wire SPI (7-pin module: GND VCC D0 D1 RES DC CS), MicroPython driver.
# Written from the Solomon Systech SSD1306 datasheet Rev 1.1:
#   8.1.3  4-wire SPI: SDIN (D1) is shifted in MSB first on each rising SCLK (D0) edge while CS# is low;
#          D/C# is sampled with the 8th bit: LOW = command byte, HIGH = GDDRAM data byte.
#   13-4   tcycle >= 100 ns, so SCLK must stay at or below 10 MHz (this driver uses 8 MHz).
#   8.9    power-on: RES# low for at least 3 us, then high, before sending commands; SEG/COM come on
#          about 100 ms after AFh.
#   App note: the internal charge pump must be enabled (8Dh 14h) before AFh (modules have no external VCC).
import framebuf
import time


class SSD1306_SPI(framebuf.FrameBuffer):
    def __init__(self, width, height, spi, dc, res, cs, baudrate=8000000):
        self.width = width
        self.height = height
        self.spi = spi
        self.dc = dc
        self.res = res
        self.cs = cs
        self.rate = min(baudrate, 10000000)   # datasheet tcycle min 100 ns
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        cs.init(cs.OUT, value=1)
        dc.init(dc.OUT, value=0)
        res.init(res.OUT, value=1)
        time.sleep_ms(1)
        res(0)                                # RES# low >= 3 us
        time.sleep_ms(10)
        res(1)
        time.sleep_ms(1)
        self.init_display()

    def _write(self, dc, buf):
        # Mode 0: SCLK idles low, data is latched on the rising edge.
        self.spi.init(baudrate=self.rate, polarity=0, phase=0)
        self.cs(1)
        self.dc(dc)
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)

    def cmd(self, *b):
        self._write(0, bytes(b))

    def init_display(self):
        self.cmd(0xAE)                         # display off
        self.cmd(0xD5, 0x80)                   # clock divide ratio / oscillator (reset value)
        self.cmd(0xA8, self.height - 1)        # multiplex ratio (63 for 64 rows)
        self.cmd(0xD3, 0x00)                   # display offset 0
        self.cmd(0x40)                         # display start line 0
        self.cmd(0x8D, 0x14)                   # enable internal charge pump
        self.cmd(0x20, 0x00)                   # horizontal addressing mode
        self.cmd(0xA1)                         # segment remap: column 127 -> SEG0
        self.cmd(0xC8)                         # COM scan COM[N-1] -> COM0
        self.cmd(0xDA, 0x02 if self.width > 2 * self.height else 0x12)  # COM pins (0x12 for 128x64)
        self.cmd(0x81, 0xCF)                   # contrast
        self.cmd(0xD9, 0xF1)                   # pre-charge 1/15 DCLK (charge pump)
        self.cmd(0xDB, 0x40)                   # VCOMH deselect level
        self.cmd(0xA4)                         # display follows RAM
        self.cmd(0xA6)                         # normal, not inverted
        self.fill(0)
        self.show()
        self.cmd(0xAF)                         # display on
        time.sleep_ms(100)                     # tAF: SEG/COM on after 100 ms

    def poweroff(self):
        self.cmd(0xAE)

    def poweron(self):
        self.cmd(0xAF)

    def contrast(self, value):
        self.cmd(0x81, value & 0xFF)

    def invert(self, on):
        self.cmd(0xA7 if on else 0xA6)

    def show(self):
        self.cmd(0x21, 0, self.width - 1)      # column address range
        self.cmd(0x22, 0, self.pages - 1)      # page address range
        self._write(1, self.buffer)            # DC high: GDDRAM data
