# TCA9534 8-bit I2C I/O expander (TI SCPS197D), MicroPython driver.
# Register map (command byte, datasheet Table 3):
#   0x00  Input Port          read-only, the levels on the pins (inputs and outputs)
#   0x01  Output Port         output latches (power-up 0xFF); reads back the latch
#   0x02  Polarity Inversion  1 = invert that input (power-up 0x00)
#   0x03  Configuration       1 = input (power-up 0xFF), 0 = push-pull output
# Address 0x20 + A2A1A0 (0x20-0x27). The SparkFun Qwiic GPIO ties A0-A2 high
# through closed jumpers, so it answers at 0x27 out of the box.
# The TCA9534 has NO internal pull-ups (unlike the TCA9554): an input pin
# left unconnected floats. Give every input an external pull-up or pull-down.

_INPUT = 0x00
_OUTPUT = 0x01
_POLARITY = 0x02
_CONFIG = 0x03

INPUT = 1
OUTPUT = 0


class TCA9534:
    def __init__(self, i2c, addr=0x27):
        """addr = 0x20 + A2A1A0 (0x27 on the SparkFun board with all ADR jumpers closed)."""
        self.i2c = i2c
        self.addr = addr

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _bit(self, reg, pin, on):
        if not 0 <= pin <= 7:
            raise ValueError('pin must be 0-7')
        v = self._r(reg)
        v = v | (1 << pin) if on else v & ~(1 << pin)
        self._w(reg, v)

    def pin_mode(self, pin, mode):
        """mode INPUT or OUTPUT. Set the output level with value() first:
        the latch powers up at 1, so a pin made an output drives high."""
        self._bit(_CONFIG, pin, mode == INPUT)

    def invert(self, pin, on=True):
        """Polarity inversion of an input pin (Input Port reads the opposite level)."""
        self._bit(_POLARITY, pin, on)

    def value(self, pin, val=None):
        """Read a pin's level (Input Port), or set its output latch (Output Port)."""
        if val is None:
            if not 0 <= pin <= 7:
                raise ValueError('pin must be 0-7')
            return (self._r(_INPUT) >> pin) & 1
        self._bit(_OUTPUT, pin, val)

    def read_port(self):
        """All 8 pin levels, bit n = Pn."""
        return self._r(_INPUT)

    def write_port(self, val):
        """Set all 8 output latches, bit n = Pn."""
        self._w(_OUTPUT, val)

    def config_port(self, inputs):
        """8-bit direction mask in one go (1 = input, 0 = output)."""
        self._w(_CONFIG, inputs)
