# MicroPython driver for the Adafruit FeatherWing OLED 128x64 (#4650), SH1107 over I2C.
# Init sequence and the glass wiring (display offset 0x60, segment remap A0, COM scan C0, 64-line multiplex)
# follow the Sino Wealth SH1107 datasheet v2.1 and Adafruit's own SH1107 drivers for this board.
# The drawing surface is a landscape 128x64 framebuf (x right, y down, buttons on the right edge).
#
# SH1107 RAM: page p (B0h-BFh) bits 0-7 drive SEG 8p..8p+7 (= landscape x); the column address
# (00h-0Fh / 10h-17h) is the line shown on a COM (= landscape row, the bottom row first on this board).
# A MONO_HMSB buffer holds 8 horizontal pixels per byte with bit 0 leftmost, so RAM byte (page p,
# column c) is simply buf[(63 - c) * 16 + p].
import framebuf
import time

_ADDR = 0x3C  # 0x3D with the ADDR jumper closed


class SH1107_FeatherWing(framebuf.FrameBuffer):
    def __init__(self, i2c, addr=_ADDR, contrast=0x4F):
        self.i2c = i2c
        self.addr = addr
        self.width = 128
        self.height = 64
        self.buf = bytearray(self.width * self.height // 8)
        super().__init__(self.buf, self.width, self.height, framebuf.MONO_HMSB)
        self._line = bytearray(65)
        self._line[0] = 0x40  # control byte: Co=0, D/C=1 -> display data follows
        self.init_display(contrast)

    def cmd(self, *bytes_):
        # control byte 0x00: Co=0, D/C=0 -> every following byte is a command
        self.i2c.writeto(self.addr, bytes((0x00,) + bytes_))

    def init_display(self, contrast=0x4F):
        self.cmd(0xAE)              # display off
        self.cmd(0xD5, 0x51)        # clock divide ratio / oscillator frequency
        self.cmd(0x20)              # page addressing mode (column auto-increments)
        self.cmd(0x81, contrast)    # contrast
        self.cmd(0xAD, 0x8A)        # built-in DC-DC on (turns on with the display)
        self.cmd(0xA0)              # segment remap off: data bit -> SEG as is
        self.cmd(0xC0)              # COM scan 0 -> N-1
        self.cmd(0xDC, 0x00)        # display start line 0
        self.cmd(0xD3, 0x60)        # display offset: the glass starts at COM 0x60 on this wing
        self.cmd(0xD9, 0x22)        # pre-charge / discharge period
        self.cmd(0xDB, 0x35)        # VCOM deselect level
        self.cmd(0xA8, 0x3F)        # multiplex ratio: 64 lines
        self.cmd(0xA4)              # show RAM contents
        self.cmd(0xA6)              # normal (not inverted)
        self.fill(0)
        self.show()                 # datasheet: clear the RAM before display on
        self.cmd(0xAF)              # display on
        time.sleep_ms(100)          # datasheet power-on sequence: wait 100 ms after AFh

    def poweroff(self):
        self.cmd(0xAE)

    def poweron(self):
        self.cmd(0xAF)
        time.sleep_ms(100)

    def contrast(self, value):
        self.cmd(0x81, value & 0xFF)

    def invert(self, on):
        self.cmd(0xA7 if on else 0xA6)

    def show(self):
        buf = self.buf
        line = self._line
        for p in range(16):
            self.cmd(0xB0 | p, 0x10, 0x00)  # page p, column 0
            i = 63 * 16 + p
            for c in range(64):
                line[c + 1] = buf[i]
                i -= 16
            self.i2c.writeto(self.addr, line)
