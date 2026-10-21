# sh1107.py - MicroPython I2C driver for the 128x128 SH1107 OLED
# (Adafruit Monochrome 1.12" 128x128 OLED, product 5297).
#
# Follows the Sino Wealth SH1107 V2.1 datasheet and the panel maker's
# (ZJY-2828TSWIG01) power-up example:
#   control byte 0x00 = command bytes follow, 0x40 = display data follows;
#   AD 8A turns the internal DC-DC off (the board has its own 12 V boost);
#   display offset 0 for this board (Adafruit's driver value for #5297);
#   clear RAM, then AF (display on) and wait 100 ms.
#
# Memory: the SH1107 RAM is 16 pages x 128 columns. Each page byte drives
# 8 SEG lines; the column address drives a COM line. On this board the
# SEG lines run across the glass and COM lines down it, so this driver
# keeps a row-major MONO_HMSB frame buffer (16 bytes per pixel row, bit 0 =
# leftmost pixel) and sends each row y to column y in vertical addressing
# mode (21H), where the page address advances after every byte.
# Segment remap A1 + COM scan C0 with offset 0 is the upright setting that
# peter-l5's SH1107 driver (tested on this board) uses at rotate=0;
# rotate180() switches to A0 + C8.

from micropython import const
import framebuf
import time

_DISPLAY_OFF = const(0xAE)
_DISPLAY_ON = const(0xAF)
_SET_CONTRAST = const(0x81)
_SET_DCDC = const(0xAD)
_VERTICAL_ADDR = const(0x21)
_SEG_REMAP = const(0xA0)
_COM_SCAN = const(0xC0)
_START_LINE = const(0xDC)
_DISPLAY_OFFSET = const(0xD3)
_CLOCK_DIV = const(0xD5)
_PRECHARGE = const(0xD9)
_VCOM_DESELECT = const(0xDB)
_MULTIPLEX = const(0xA8)
_ENTIRE_ON_RESUME = const(0xA4)
_NORMAL_DISPLAY = const(0xA6)
_PAGE_ADDR = const(0xB0)


class SH1107_I2C(framebuf.FrameBuffer):
    def __init__(self, width, height, i2c, addr=0x3D, res=None):
        if width != 128 or height != 128:
            raise ValueError('this driver is for the 128x128 panel')
        self.width = width
        self.height = height
        self.i2c = i2c
        self.addr = addr
        self.res = res
        self.stride = width // 8
        self.buffer = bytearray(self.stride * height)
        self._mv = memoryview(self.buffer)
        self._row_cmd = bytearray(4)
        self._row_cmd[0] = 0x00
        self._flipped = False
        super().__init__(self.buffer, width, height, framebuf.MONO_HMSB)
        self.reset()
        self.init_display()

    def write_cmd(self, *cmds):
        self.i2c.writeto(self.addr, bytes((0x00,) + cmds))

    def reset(self):
        # The board has an APX803 power-on reset; RST is only needed to
        # recover a display that got noise on its bus. Low pulse >= 10 us.
        if self.res is not None:
            self.res.init(self.res.OUT, value=1)
            time.sleep_ms(1)
            self.res(0)
            time.sleep_ms(1)
            self.res(1)
            time.sleep_ms(1)

    def init_display(self):
        self.write_cmd(_DISPLAY_OFF)
        self.write_cmd(_CLOCK_DIV, 0x51)
        self.write_cmd(_SET_CONTRAST, 0x4F)
        self.write_cmd(_SET_DCDC, 0x8A)        # internal DC-DC off
        self.write_cmd(_VERTICAL_ADDR)
        self.write_cmd(_START_LINE, 0x00)
        self.write_cmd(_DISPLAY_OFFSET, 0x00)
        self.write_cmd(_PRECHARGE, 0x22)
        self.write_cmd(_VCOM_DESELECT, 0x35)
        self.write_cmd(_MULTIPLEX, 0x7F)       # 128 COM lines
        self.write_cmd(_ENTIRE_ON_RESUME)
        self.write_cmd(_NORMAL_DISPLAY)
        self.rotate180(False, update=False)
        self.fill(0)
        self.show()                            # clear RAM before turning on
        self.poweron()

    def poweron(self):
        self.write_cmd(_DISPLAY_ON)
        time.sleep_ms(100)                     # datasheet: wait 100 ms

    def poweroff(self):
        self.write_cmd(_DISPLAY_OFF)

    def contrast(self, value):
        self.write_cmd(_SET_CONTRAST, value & 0xFF)

    def invert(self, on):
        self.write_cmd(_NORMAL_DISPLAY | (1 if on else 0))

    def rotate180(self, on=True, update=True):
        # A1/C0 = upright on this board, A0/C8 = turned 180 degrees.
        self._flipped = bool(on)
        self.write_cmd(_SEG_REMAP | (0 if on else 1))
        self.write_cmd(_COM_SCAN | (0x08 if on else 0x00))
        if update:
            self.show()

    def show(self):
        cmd = self._row_cmd
        mv = self._mv
        stride = self.stride
        for y in range(self.height):
            cmd[1] = _PAGE_ADDR                # page 0
            cmd[2] = y & 0x0F                  # column low nibble
            cmd[3] = 0x10 | (y >> 4)           # column high bits
            self.i2c.writeto(self.addr, cmd)
            start = y * stride
            self.i2c.writevto(self.addr, (b'\x40', mv[start:start + stride]))
