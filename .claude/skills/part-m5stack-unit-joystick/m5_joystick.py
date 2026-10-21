# M5Stack Unit Joystick (SKU U024, I2C), MicroPython driver.
# An ATmega328 (M5Stack firmware) reads the thumb stick's two 10 kOhm pots on ADC0/ADC1 and the
# push switch, and answers at I2C address 0x52 with 3 bytes (M5Stack protocol table, register 0x52):
#   [0] X value  [1] Y value  (one byte each, 0-255; M5Stack's U024 sheet gives 10-250 in practice,
#                              about 128 at rest)
#   [2] button   (0 = released, 1 = pressed)
# The firmware always returns these 3 bytes. M5Stack's own MicroPython driver (UiFlow2) writes
# register byte 0x52 first and then reads 3 bytes; their Arduino example reads 3 bytes directly.
# Both work. The unit has no I2C pull-ups of its own: your board needs them (to 3.3 V).

ADDR = 0x52
REG = 0x52


class UnitJoystick:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr
        self._buf = bytearray(3)

    def read(self):
        """Return (x, y, pressed): x and y are 0-255 (about 128 at rest), pressed is True/False."""
        self.i2c.readfrom_mem_into(self.addr, REG, self._buf)
        b = self._buf
        return b[0], b[1], b[2] != 0

    def x(self):
        return self.read()[0]

    def y(self):
        return self.read()[1]

    def pressed(self):
        return self.read()[2]

    def centred(self):
        """(x, y) as signed offsets from the 128 mid-point, about -128..127 (as M5Stack's get_x/get_y)."""
        x, y, _ = self.read()
        return x - 128, y - 128
