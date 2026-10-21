# SSD1306 0.91" 128x32 I2C OLED, MicroPython driver.
# Command sequence from the Solomon Systech SSD1306 datasheet (Rev 1.1): section 10 command
# table and the charge-pump application note (8Dh 14h before AFh). A 128x32 panel uses
# multiplex ratio 31 (A8h 1Fh) and sequential COM pins without left/right remap (DAh 02h).
# I2C: control byte 0x80 = one command byte follows (Co=1, D/C#=0); 0x40 = data stream (Co=0, D/C#=1).
import framebuf
import time


class SSD1306_I2C(framebuf.FrameBuffer):
    def __init__(self, i2c, addr=0x3C, width=128, height=32):
        self.i2c = i2c
        self.addr = addr
        self.width = width
        self.height = height
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        self.init_display()

    def cmd(self, c):
        self.i2c.writeto(self.addr, bytes((0x80, c)))

    def init_display(self):
        for c in (
            0xAE,                 # display off
            0xD5, 0x80,           # clock divide ratio / oscillator frequency (reset value)
            0xA8, self.height - 1,  # multiplex ratio: 31 for 32 rows
            0xD3, 0x00,           # display offset 0
            0x40,                 # display start line 0
            0x8D, 0x14,           # enable internal charge pump (module has no external VCC)
            0x20, 0x00,           # horizontal addressing mode
            0xA1,                 # segment remap: column 127 -> SEG0
            0xC8,                 # COM scan direction remapped (COM[N-1] -> COM0)
            0xDA, 0x02 if self.width > 2 * self.height else 0x12,  # COM pins: sequential, no remap for 128x32
            0x81, 0x8F,           # contrast
            0xD9, 0xF1,           # pre-charge: phase 1 = 1 DCLK, phase 2 = 15 DCLK (charge pump)
            0xDB, 0x30,           # VCOMH deselect level ~0.83 x VCC
            0xA4,                 # display follows RAM
            0xA6,                 # normal (not inverted)
            0xAF,                 # display on
        ):
            self.cmd(c)
        time.sleep_ms(100)        # datasheet: allow 100 ms after AFh for the panel to come up
        self.fill(0)
        self.show()

    def poweroff(self):
        self.cmd(0xAE)

    def poweron(self):
        self.cmd(0xAF)

    def contrast(self, value):
        self.cmd(0x81)
        self.cmd(value & 0xFF)

    def invert(self, on):
        self.cmd(0xA7 if on else 0xA6)

    def show(self):
        for c in (0x21, 0, self.width - 1, 0x22, 0, self.pages - 1):
            self.cmd(c)
        self.i2c.writeto(self.addr, b'\x40' + self.buffer)
