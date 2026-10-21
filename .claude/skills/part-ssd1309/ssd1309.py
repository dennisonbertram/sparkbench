# SSD1309 128x64 OLED (e.g. DIYables 2.4" SSD1309 I2C module, "2.42OLED-IIC"), MicroPython driver.
# Written from the Solomon Systech SSD1309 datasheet Rev 1.1. The SSD1309 has no internal
# charge pump (there is no 8Dh command): the module's own boost converter makes the panel VCC.
# I2C control byte: 0x00 = command stream, 0x40 = GDDRAM data stream (datasheet 8.1.5).
import framebuf
import time


class SSD1309_I2C(framebuf.FrameBuffer):
    def __init__(self, width, height, i2c, addr=0x3C, res=None):
        self.width = width
        self.height = height
        self.i2c = i2c
        self.addr = addr  # 0x3C (SA0 low, "0X78" 8-bit) or 0x3D (SA0 high, "0X7A")
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        if res is not None:
            # Power ON sequence (datasheet 8.8): RES# low for at least 3 us, then high.
            res.value(1)
            time.sleep_ms(1)
            res.value(0)
            time.sleep_ms(1)
            res.value(1)
            time.sleep_ms(1)
        self.init_display()

    def cmd(self, *b):
        self.i2c.writeto(self.addr, bytes((0x00,) + b))

    def init_display(self):
        self.cmd(0xAE)                    # display off
        self.cmd(0xD5, 0x70)              # clock divide 1, oscillator 0111b (reset value)
        self.cmd(0xA8, self.height - 1)   # multiplex ratio
        self.cmd(0xD3, 0x00)              # display offset 0
        self.cmd(0x40)                    # start line 0
        self.cmd(0x20, 0x00)              # horizontal addressing mode
        self.cmd(0xA1)                    # column 127 -> SEG0 (panel mounted mirrored)
        self.cmd(0xC8)                    # COM scan COM[N-1] -> COM0
        self.cmd(0xDA, 0x12)              # alternative COM pin configuration
        self.cmd(0x81, 0x7F)              # contrast (reset value)
        self.cmd(0xD9, 0x22)              # pre-charge phase 1 = 2, phase 2 = 2 DCLK (reset value)
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
        self.i2c.writeto(self.addr, b'\x40' + self.buffer)
