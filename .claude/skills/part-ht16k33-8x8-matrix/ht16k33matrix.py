# HT16K33 8x8 LED matrix backpack (Adafruit Small 1.2" 8x8 LED Matrix w/I2C Backpack), MicroPython driver.
# Written from the Holtek HT16K33 datasheet (Rev 1.10) and the Adafruit backpack schematic / library:
#   0x21        system setup: oscillator on (leave standby)
#   0x80|B<<1|D display setup: D = display on, B = blink (0 off, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz)
#   0xE0|P      dimming: P = 0..15 -> 1/16 .. 16/16 duty
#   0x00 + data display RAM write from address 0 (address pointer auto-increments)
# On this backpack matrix row y is driven by COM y, so row y is RAM byte 2*y (the odd bytes,
# ROW8..ROW15, are unused). The columns are wired to ROW0..ROW7 shifted by one:
# column x is bit (x + 7) % 8 (same mapping as Adafruit_LEDBackpack drawPixel).
import framebuf
from micropython import const

_OSC_ON = const(0x21)
_DISPLAY = const(0x80)
_DIMMING = const(0xE0)


class HT16K33Matrix(framebuf.FrameBuffer):
    """8x8 framebuffer: use pixel(), fill(), text(), line(), rect() ... then show()."""

    def __init__(self, i2c, address=0x70, brightness=15):
        self.i2c = i2c
        self.address = address
        self.buf = bytearray(8)          # MONO_HLSB: one byte per row, bit 7 = x 0
        super().__init__(self.buf, 8, 8, framebuf.MONO_HLSB)
        self.ram = bytearray(17)         # command 0x00 + 16 display RAM bytes
        self._cmd(_OSC_ON)               # oscillator on (power-up default is standby)
        self.brightness(brightness)
        self.fill(0)
        self.show()                      # clear RAM before switching the display on
        self.blink(0)                    # display on, no blinking

    def _cmd(self, c):
        self.i2c.writeto(self.address, bytes((c,)))

    def brightness(self, level):
        """0 (dimmest, 1/16 duty) .. 15 (brightest, 16/16 duty)."""
        self._cmd(_DIMMING | max(0, min(15, int(level))))

    def blink(self, rate):
        """0 = steady, 1 = 2 Hz, 2 = 1 Hz, 3 = 0.5 Hz. Also switches the display on."""
        self._cmd(_DISPLAY | ((rate & 3) << 1) | 1)

    def off(self):
        self._cmd(_DISPLAY)

    def show(self):
        ram = self.ram
        for i in range(1, 17):
            ram[i] = 0
        for y in range(8):
            row = self.buf[y]
            b = 0
            for x in range(8):
                if row & (0x80 >> x):
                    b |= 1 << ((x + 7) & 7)
            ram[1 + 2 * y] = b
        ram[0] = 0x00                    # display RAM address 0
        self.i2c.writeto(self.address, ram)
