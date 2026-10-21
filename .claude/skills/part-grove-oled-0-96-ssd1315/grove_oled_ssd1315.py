# Seeed Grove - OLED Display 0.96" (SSD1315, 128x64, I2C), MicroPython driver.
# Written from the Solomon Systech SSD1315 datasheet (sections 6.2 I2C interface, 6.9.2 power-on
# sequence with charge pump, 6.10 charge pump regulator) and the panel maker's init code for the
# 0.96" SSD1315 module Seeed uses (internal charge pump, 8Dh 14h). The SSD1315 keeps the SSD1306
# command set. I2C: control byte 0x00 = command stream (Co=0, D/C#=0), 0x40 = GDDRAM data stream.
# The Grove board has its own power-on reset circuit (R5/C5/D1), so no RES# pin is needed.
import framebuf
import time


class SSD1315_I2C(framebuf.FrameBuffer):
    def __init__(self, i2c, addr=0x3C, width=128, height=64):
        self.i2c = i2c
        self.addr = addr  # 0x3C (jumper "0x78", default) or 0x3D (jumper "0x7A")
        self.width = width
        self.height = height
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        time.sleep_ms(20)   # datasheet 6.9.2: wait >= 20 ms after VDD is stable (board RC reset)
        self.init_display()

    def cmd(self, *b):
        self.i2c.writeto(self.addr, bytes((0x00,) + b))

    def init_display(self):
        self.cmd(0xAE)                   # display off
        self.cmd(0xD5, 0x80)             # clock divide ratio / oscillator frequency
        self.cmd(0xA8, self.height - 1)  # multiplex ratio: 63 for 64 rows
        self.cmd(0xD3, 0x00)             # display offset 0
        self.cmd(0x40)                   # display start line 0
        self.cmd(0x20, 0x00)             # horizontal addressing mode
        self.cmd(0xA1)                   # segment remap: column 127 -> SEG0
        self.cmd(0xC8)                   # COM scan COM[N-1] -> COM0
        self.cmd(0xDA, 0x12)             # alternative COM pin configuration (128x64)
        self.cmd(0x81, 0x7F)             # contrast
        self.cmd(0xD9, 0x22)             # pre-charge period (module maker's value)
        self.cmd(0xDB, 0x30)             # VCOMH deselect level (module maker's value)
        self.cmd(0xA4)                   # display follows RAM
        self.cmd(0xA6)                   # normal (not inverted)
        self.cmd(0x8D, 0x14)             # enable internal charge pump (VBAT = 3.3 V on the board)
        self.fill(0)
        self.show()
        self.cmd(0xAF)                   # display on
        time.sleep_ms(100)               # SEG/COM turn on 100 ms after AFh (tAF)

    def poweroff(self):
        self.cmd(0xAE)                   # display off, then charge pump off (power-off sequence)
        self.cmd(0x8D, 0x10)

    def poweron(self):
        self.cmd(0x8D, 0x14)
        self.cmd(0xAF)
        time.sleep_ms(100)

    def contrast(self, c):
        self.cmd(0x81, c & 0xFF)

    def invert(self, on):
        self.cmd(0xA7 if on else 0xA6)

    def show(self):
        self.cmd(0x21, 0, self.width - 1)   # column range
        self.cmd(0x22, 0, self.pages - 1)   # page range
        self.i2c.writeto(self.addr, b'\x40' + self.buffer)
