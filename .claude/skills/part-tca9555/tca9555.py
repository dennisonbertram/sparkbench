# TCA9555 16-bit I2C I/O expander (TI SCPS200E), MicroPython driver.
# Register map (command byte, datasheet Table 3):
#   0x00 / 0x01  Input Port 0 / 1         read-only, the levels on the pins
#   0x02 / 0x03  Output Port 0 / 1        output latches (power-up 0xFF)
#   0x04 / 0x05  Polarity Inversion 0 / 1 1 = invert that input (power-up 0x00)
#   0x06 / 0x07  Configuration 0 / 1      1 = input (power-up 0xFF), 0 = output
# Registers come in pairs: after the command byte, a 2-byte read or write
# moves from port 0 to port 1 of the same pair.
# Pins are numbered 0-15: 0-7 = P00-P07, 8-15 = P10-P17.
# Every input has a fixed internal ~100 kOhm pull-up (no register for it):
# an undriven input reads 1, a button to GND reads 0.

_INPUT0 = 0x00
_OUTPUT0 = 0x02
_POLARITY0 = 0x04
_CONFIG0 = 0x06

INPUT = 1
OUTPUT = 0


class TCA9555:
    def __init__(self, i2c, addr=0x20):
        """addr = 0x20 + A2A1A0 (0x20 with all address pins low)."""
        self.i2c = i2c
        self.addr = addr

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _bit(self, base, pin, on):
        if not 0 <= pin <= 15:
            raise ValueError('pin must be 0-15')
        reg = base + (pin >> 3)  # port 0 register, or the port 1 register right after it
        v = self._r(reg)
        v = v | (1 << (pin & 7)) if on else v & ~(1 << (pin & 7))
        self._w(reg, v)

    def pin_mode(self, pin, mode):
        """mode INPUT or OUTPUT. Set the output level with value() first:
        the latch powers up at 1, so a pin made an output drives high."""
        self._bit(_CONFIG0, pin, mode == INPUT)

    def invert(self, pin, on=True):
        """Polarity inversion of an input pin (read back as the opposite level)."""
        self._bit(_POLARITY0, pin, on)

    def value(self, pin, val=None):
        """Read a pin's level (Input Port register), or set its output latch (Output Port register)."""
        if val is None:
            if not 0 <= pin <= 15:
                raise ValueError('pin must be 0-15')
            return (self._r(_INPUT0 + (pin >> 3)) >> (pin & 7)) & 1
        self._bit(_OUTPUT0, pin, val)

    def read_port(self):
        """All 16 pin levels: bits 0-7 = P00-P07, bits 8-15 = P10-P17."""
        d = self.i2c.readfrom_mem(self.addr, _INPUT0, 2)  # Input Port 0 then Input Port 1
        return d[0] | (d[1] << 8)

    def write_port(self, val):
        """Set all 16 output latches: bits 0-7 = P00-P07, bits 8-15 = P10-P17."""
        self.i2c.writeto_mem(self.addr, _OUTPUT0, bytes([val & 0xFF, (val >> 8) & 0xFF]))

    def config_port(self, inputs):
        """16-bit direction mask in one go (1 = input, 0 = output)."""
        self.i2c.writeto_mem(self.addr, _CONFIG0, bytes([inputs & 0xFF, (inputs >> 8) & 0xFF]))
