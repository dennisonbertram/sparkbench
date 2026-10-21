# MCP23017 16-bit I2C I/O expander (Microchip DS20001952), MicroPython driver.
# Uses the power-on register map (IOCON.BANK = 0, sequential addressing):
#   IODIRA 0x00 / IODIRB 0x01  1 = input (reset value 0xFF), 0 = output
#   GPPUA  0x0C / GPPUB  0x0D  1 = 100 kOhm pull-up on an input
#   GPIOA  0x12 / GPIOB  0x13  read = the level on the pins
#   OLATA  0x14 / OLATB  0x15  output latches (what output pins drive)
# Pins are numbered 0-15: 0-7 = GPA0-GPA7, 8-15 = GPB0-GPB7.
# Note: on the MCP23017 (not the SPI MCP23S17) GPA7 and GPB7 are output only (datasheet rev D).

_IODIRA = 0x00
_IOCON = 0x0A
_GPPUA = 0x0C
_GPIOA = 0x12
_OLATA = 0x14

INPUT = 1
OUTPUT = 0


class MCP23017:
    def __init__(self, i2c, addr=0x20):
        """addr = 0x20 + A2A1A0 (0x20 with all address pins low, as on the CJMCU-2317)."""
        self.i2c = i2c
        self.addr = addr
        # IOCON = 0: BANK = 0 (A/B registers paired), sequential addressing, INT pins active-low push-pull.
        self._w(_IOCON, 0x00)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _bit(self, base, pin, on):
        if not 0 <= pin <= 15:
            raise ValueError('pin must be 0-15')
        reg = base + (pin >> 3)  # A register, or the B register right after it
        v = self._r(reg)
        v = v | (1 << (pin & 7)) if on else v & ~(1 << (pin & 7))
        self._w(reg, v)

    def pin_mode(self, pin, mode, pullup=False):
        """mode INPUT or OUTPUT; pullup enables the internal 100 kOhm pull-up (inputs only)."""
        if mode == INPUT and (pin & 7) == 7:
            raise ValueError('GPA7/GPB7 are output only on the MCP23017')
        self._bit(_IODIRA, pin, mode == INPUT)
        self._bit(_GPPUA, pin, pullup)

    def value(self, pin, val=None):
        """Read a pin's level (GPIO register), or set an output pin (OLAT register)."""
        if val is None:
            reg = _GPIOA + (pin >> 3)
            return (self._r(reg) >> (pin & 7)) & 1
        self._bit(_OLATA, pin, val)

    def read_port(self):
        """All 16 pin levels: bits 0-7 = GPA, bits 8-15 = GPB."""
        d = self.i2c.readfrom_mem(self.addr, _GPIOA, 2)  # GPIOA then GPIOB (auto-increment)
        return d[0] | (d[1] << 8)

    def write_port(self, val):
        """Set all 16 output latches: bits 0-7 = GPA, bits 8-15 = GPB."""
        self.i2c.writeto_mem(self.addr, _OLATA, bytes([val & 0xFF, (val >> 8) & 0xFF]))

    def config_port(self, iodir, pullups=0):
        """16-bit direction (1 = input) and pull-up masks in one go."""
        self.i2c.writeto_mem(self.addr, _IODIRA, bytes([iodir & 0xFF, (iodir >> 8) & 0xFF]))
        self.i2c.writeto_mem(self.addr, _GPPUA, bytes([pullups & 0xFF, (pullups >> 8) & 0xFF]))
