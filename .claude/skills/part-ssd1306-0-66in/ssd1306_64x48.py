# WEMOS/LOLIN D1 mini OLED 0.66" shield (64x48, SSD1306, I2C), MicroPython driver.
# Command sequence from the Solomon Systech SSD1306 datasheet (Rev 1.1): section 10 command table
# and the charge-pump note (8Dh 14h before AFh). The 0.66" glass is wired to the middle of the
# controller: SEG columns 32..95 and COM0..COM47, so the multiplex ratio is 47 (A8h 2Fh), COM pins
# use the alternative configuration (DAh 12h) and every frame is written to columns 32..95.
# I2C: control byte 0x80 = one command byte follows (Co=1, D/C#=0); 0x40 = data stream (Co=0, D/C#=1).
# Address 0x3C (solder jumper SJ1 shorted, default) or 0x3D (SJ1 cut).
import framebuf
import time

COL_OFFSET = 32  # first GDDRAM column the 64-pixel-wide glass shows


class SSD1306_64x48(framebuf.FrameBuffer):
    def __init__(self, i2c, addr=0x3C, width=64, height=48):
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
            0xAE,                   # display off
            0xD5, 0x80,             # clock divide ratio / oscillator frequency (reset value)
            0xA8, self.height - 1,  # multiplex ratio: 47 for 48 rows
            0xD3, 0x00,             # display offset 0
            0x40,                   # display start line 0
            0x8D, 0x14,             # enable internal charge pump (VBAT tied to 3V3 on the shield)
            0x20, 0x00,             # horizontal addressing mode
            0xA1,                   # segment remap: column 127 -> SEG0
            0xC8,                   # COM scan direction remapped (COM[N-1] -> COM0)
            0xDA, 0x12,             # COM pins: alternative configuration, no left/right remap
            0x81, 0xCF,             # contrast
            0xD9, 0xF1,             # pre-charge: phase 1 = 1 DCLK, phase 2 = 15 DCLK (charge pump)
            0xDB, 0x40,             # VCOMH deselect level
            0xA4,                   # display follows RAM
            0xA6,                   # normal (not inverted)
            0xAF,                   # display on
        ):
            self.cmd(c)
        time.sleep_ms(100)          # datasheet power-on sequence: wait 100 ms after AFh
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
        x0 = COL_OFFSET
        x1 = COL_OFFSET + self.width - 1
        for c in (0x21, x0, x1, 0x22, 0, self.pages - 1):
            self.cmd(c)
        self.i2c.writeto(self.addr, b'\x40' + self.buffer)
