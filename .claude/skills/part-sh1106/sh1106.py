# SH1106 132x64 OLED controller (Sino Wealth), MicroPython I2C driver for 1.3" 128x64 modules.
# Command set and power-on sequence from the SH1106 datasheet V2.3:
#   I2C control byte: Co (bit 7) and D/C (bit 6); 0x80 = one command byte follows, 0x40 = display data follows.
#   The SH1106 has 132 RAM columns; 1.3" 128-pixel panels show columns 2..129, so each page is written from column 2.
#   Page addressing only (B0h-B7h page, 00h-0Fh / 10h-1Fh column): the SH1106 has no 20h/21h/22h address-window commands.
import time
import framebuf


class SH1106_I2C(framebuf.FrameBuffer):
    def __init__(self, width, height, i2c, addr=0x3C, col_offset=2):
        self.width = width
        self.height = height
        self.i2c = i2c
        self.addr = addr
        self.col_offset = col_offset
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        self.init_display()

    def cmd(self, c):
        self.i2c.writeto(self.addr, bytes((0x80, c)))

    def init_display(self):
        for c in (
            0xAE,              # display off (sleep)
            0xD5, 0x80,        # clock divide ratio 1, oscillator +15 %
            0xA8, self.height - 1,  # multiplex ratio
            0xD3, 0x00,        # display offset 0
            0x40,              # display start line 0
            0xAD, 0x8B,        # DC-DC control: built-in DC-DC on (needed by these modules)
            0x32,              # charge pump output 8.0 V (POR)
            0xA1,              # segment re-map: column 131 -> SEG0 (module orientation)
            0xC8,              # COM scan COM[N-1] -> COM0
            0xDA, 0x12,        # common pads: alternative (POR)
            0x81, 0x80,        # contrast 128 (POR)
            0xD9, 0x22,        # discharge/precharge 2/2 DCLKs (POR)
            0xDB, 0x35,        # VCOM deselect level (POR)
            0xA4,              # display follows RAM
            0xA6,              # normal (not inverted)
        ):
            self.cmd(c)
        # Clear all 132 RAM columns of every page (datasheet: clear RAM before display on)
        blank = b'\x40' + bytes(132)
        for page in range(8):
            self.cmd(0xB0 | page)
            self.cmd(0x00)
            self.cmd(0x10)
            self.i2c.writeto(self.addr, blank)
        self.cmd(0xAF)         # display on
        time.sleep_ms(100)     # datasheet: wait 100 ms after display on before sending data
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
        col = self.col_offset
        for page in range(self.pages):
            self.cmd(0xB0 | page)
            self.cmd(col & 0x0F)
            self.cmd(0x10 | (col >> 4))
            start = page * self.width
            self.i2c.writeto(self.addr, b'\x40' + self.buffer[start:start + self.width])
