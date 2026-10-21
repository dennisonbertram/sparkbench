# MCP23008 8-bit I/O expander (Microchip DS20001919F), MicroPython driver.
# Register map (IOCON.BANK does not exist on the MCP23008; addresses are fixed):
#   0x00 IODIR (1 = input, POR 0xFF)  0x01 IPOL  0x02 GPINTEN  0x03 DEFVAL  0x04 INTCON
#   0x05 IOCON  0x06 GPPU (1 = weak pull-up on, 40-115 uA at 5 V)  0x07 INTF  0x08 INTCAP
#   0x09 GPIO (read = pin levels)  0x0A OLAT (output latch; read = latch, not the pins)
# I2C address 0b0100 A2 A1 A0: 0x20 with A0-A2 tied to GND, up to 0x27.

IODIR = 0x00
IPOL = 0x01
GPINTEN = 0x02
DEFVAL = 0x03
INTCON = 0x04
IOCON = 0x05
GPPU = 0x06
INTF = 0x07
INTCAP = 0x08
GPIO = 0x09
OLAT = 0x0A

INPUT = 1
OUTPUT = 0


class MCP23008:
    def __init__(self, i2c, addr=0x20):
        self.i2c = i2c
        self.addr = addr

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _bit(self, reg, pin, on):
        v = self._r(reg)
        v = (v | (1 << pin)) if on else (v & ~(1 << pin))
        self._w(reg, v)

    def setup(self, pin, mode, pullup=False):
        """pin 0-7 (GP0-GP7); mode INPUT or OUTPUT; pullup enables the internal weak pull-up (inputs)."""
        self._bit(IODIR, pin, mode == INPUT)
        self._bit(GPPU, pin, pullup)

    def output(self, pin, value):
        """Drive an output pin high (1) or low (0). Read-modify-write of OLAT, as the datasheet advises."""
        self._bit(OLAT, pin, value)

    def input(self, pin):
        """Logic level on a pin (GPIO register), 0 or 1. IPOL inverts it if set."""
        return (self._r(GPIO) >> pin) & 1

    @property
    def gpio(self):
        """All eight pin levels as one byte (GP7 = bit 7)."""
        return self._r(GPIO)

    @gpio.setter
    def gpio(self, val):
        """Write all eight output latches at once."""
        self._w(OLAT, val)

    def direction(self, mask):
        """Set IODIR in one write: bit = 1 makes that pin an input."""
        self._w(IODIR, mask)

    def pullups(self, mask):
        """Set GPPU in one write: bit = 1 enables that pin's weak pull-up."""
        self._w(GPPU, mask)
