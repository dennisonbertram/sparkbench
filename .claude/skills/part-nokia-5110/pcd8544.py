# MicroPython driver for the Philips PCD8544 84x48 mono LCD controller (Nokia 5110 module).
# Datasheet: Philips PCD8544 product specification, 1999 Apr 12.
# Write-only serial bus: SPI mode 0, MSB first, max 4 MHz. D/C low = command, high = display data.
import framebuf
from micropython import const
from time import sleep_ms

WIDTH = const(84)
HEIGHT = const(48)

# Instruction set (datasheet Table 1)
_FUNCTION_SET = const(0x20)   # 0 0 1 0 0 PD V H
_PD = const(0x04)             # power-down
_V = const(0x02)              # vertical addressing
_H = const(0x01)              # extended instruction set
_DISPLAY_CONTROL = const(0x08)  # H=0: 0 0 0 0 1 D 0 E
_DISPLAY_BLANK = const(0x08)
_DISPLAY_NORMAL = const(0x0C)
_DISPLAY_ALL_ON = const(0x09)
_DISPLAY_INVERSE = const(0x0D)
_SET_Y = const(0x40)          # H=0: bank 0..5
_SET_X = const(0x80)          # H=0: column 0..83
_TEMP_COEFF = const(0x04)     # H=1: TC1 TC0
_BIAS = const(0x10)           # H=1: BS2..BS0
_SET_VOP = const(0x80)        # H=1: VOP6..VOP0, VLCD = 3.06 + VOP * 0.06 V


class PCD8544(framebuf.FrameBuffer):
    """84x48 frame buffer; draw with the framebuf methods, then call show()."""

    def __init__(self, spi, cs, dc, rst=None, contrast=0x3F, bias=3, temp=0):
        # cs/dc/rst: Pin objects or GPIO numbers. contrast = VOP (0..127): keep VLCD <= 8.5 V,
        # i.e. VOP <= 90; 0x30..0x45 suits most modules. bias 3 = 1:48 mux (datasheet Table 4).
        from machine import Pin
        self.spi = spi
        self.cs = cs if isinstance(cs, Pin) else Pin(cs)
        self.dc = dc if isinstance(dc, Pin) else Pin(dc)
        self.rst = None if rst is None else (rst if isinstance(rst, Pin) else Pin(rst))
        self.cs.init(Pin.OUT, value=1)
        self.dc.init(Pin.OUT, value=0)
        if self.rst is not None:
            self.rst.init(Pin.OUT, value=1)
        self.buf = bytearray(WIDTH * HEIGHT // 8)
        # MONO_VLSB matches the PCD8544 RAM in horizontal addressing: byte = bank*84 + x, LSB on top.
        super().__init__(self.buf, WIDTH, HEIGHT, framebuf.MONO_VLSB)
        self._contrast = contrast & 0x7F
        self._bias = bias & 0x07
        self._temp = temp & 0x03
        self.reset()
        self.init_display()

    def reset(self):
        # Datasheet 8.1: a RES pulse is mandatory after power-on (RES LOW >= 100 ns).
        if self.rst is not None:
            self.rst(0)
            sleep_ms(1)
            self.rst(1)
            sleep_ms(1)

    def write_cmd(self, *cmds):
        self.dc(0)
        self.cs(0)
        self.spi.write(bytes(cmds))
        self.cs(1)

    def write_data(self, buf):
        self.dc(1)
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)

    def init_display(self):
        # Datasheet Table 6 programming example, plus temperature coefficient and bias.
        self.write_cmd(
            _FUNCTION_SET | _H,               # PD=0, V=0, extended set
            _TEMP_COEFF | self._temp,
            _BIAS | self._bias,
            _SET_VOP | self._contrast,
            _FUNCTION_SET,                    # back to basic set, horizontal addressing
            _DISPLAY_NORMAL,
        )
        # RAM is undefined after power-on: clear it.
        self.fill(0)
        self.show()

    def contrast(self, vop):
        self._contrast = vop & 0x7F
        self.write_cmd(_FUNCTION_SET | _H, _SET_VOP | self._contrast, _FUNCTION_SET)

    def invert(self, on):
        self.write_cmd(_DISPLAY_INVERSE if on else _DISPLAY_NORMAL)

    def power_off(self):
        # Datasheet 8.3.1: fill the RAM with 0s before entering power-down.
        self.fill(0)
        self.show()
        self.write_cmd(_FUNCTION_SET | _PD)

    def power_on(self):
        self.init_display()

    def show(self):
        self.write_cmd(_SET_X | 0, _SET_Y | 0)
        self.write_data(self.buf)
