# SX1509 16-channel I2C GPIO expander (Semtech SX1509, datasheet rev 1), MicroPython driver.
# SX1509 register map (section 5.3). Every pair is Bank B (IO8-IO15) FIRST, then Bank A (IO0-IO7):
#   RegInputDisableB/A 0x00/0x01  1 = input buffer off (reset 0x00)
#   RegPullUpB/A       0x06/0x07  1 = internal pull-up on
#   RegPullDownB/A     0x08/0x09  1 = internal pull-down on
#   RegOpenDrainB/A    0x0A/0x0B  1 = open-drain output
#   RegDirB/A          0x0E/0x0F  1 = input (reset 0xFF), 0 = output
#   RegDataB/A         0x10/0x11  write = output level, read = level seen at the pins (reset 0xFF)
#   RegInterruptMaskA  0x13       reset 0xFF (used as a presence check)
#   RegReset           0x7D       write 0x12 then 0x34 = software reset to defaults
# Address: 0x3E (ADDR1 ADDR0 = 00), 0x3F (01), 0x70 (10), 0x71 (11).
# Pins are numbered 0-15 as printed on the board: 0-7 = Bank A, 8-15 = Bank B.

_INPUT_DISABLE_B = 0x00
_PULLUP_B = 0x06
_PULLDOWN_B = 0x08
_OPEN_DRAIN_B = 0x0A
_DIR_B = 0x0E
_DATA_B = 0x10
_INT_MASK_A = 0x13
_RESET = 0x7D

INPUT = 1
OUTPUT = 0


class SX1509:
    def __init__(self, i2c, addr=0x3E, reset=True):
        """addr 0x3E with both ADD jumpers at 0 (SparkFun BOB-13601 default)."""
        self.i2c = i2c
        self.addr = addr
        if reset:
            # Software reset (datasheet 4.4.2): 0x12 then 0x34 to RegReset.
            self._w(_RESET, 0x12)
            self._w(_RESET, 0x34)
        # RegInterruptMaskA resets to 0xFF: a quick check that an SX1509 answers.
        if self._r(_INT_MASK_A) != 0xFF:
            raise OSError('SX1509 not found at 0x%02X' % addr)
        # Shadow of the output latches (RegData resets to 0xFFFF). Reading RegData returns
        # pin levels, not the latch, so outputs are changed from this copy.
        self._out = 0xFFFF

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _r16(self, reg_b):
        """Read a Bank B / Bank A register pair as a 16-bit value (bits 0-7 = IO0-7)."""
        d = self.i2c.readfrom_mem(self.addr, reg_b, 2)  # B then A (auto-increment)
        return d[1] | (d[0] << 8)

    def _w16(self, reg_b, val):
        self.i2c.writeto_mem(self.addr, reg_b, bytes([(val >> 8) & 0xFF, val & 0xFF]))

    def _bit(self, reg_b, pin, on):
        if not 0 <= pin <= 15:
            raise ValueError('pin must be 0-15')
        reg = reg_b if pin >= 8 else reg_b + 1  # Bank B register, or Bank A right after it
        v = self._r(reg)
        m = 1 << (pin & 7)
        self._w(reg, (v | m) if on else (v & ~m))

    def pin_mode(self, pin, mode, pull=None):
        """mode INPUT or OUTPUT; pull = 'up', 'down' or None (inputs only)."""
        if mode == OUTPUT:
            self._bit(_PULLUP_B, pin, False)
            self._bit(_PULLDOWN_B, pin, False)
            self._bit(_OPEN_DRAIN_B, pin, False)
            self._bit(_DIR_B, pin, False)
        else:
            self._bit(_INPUT_DISABLE_B, pin, False)
            self._bit(_PULLUP_B, pin, pull == 'up')
            self._bit(_PULLDOWN_B, pin, pull == 'down')
            self._bit(_DIR_B, pin, True)

    def value(self, pin, val=None):
        """Read the level at a pin (RegData read), or set an output pin's level."""
        if not 0 <= pin <= 15:
            raise ValueError('pin must be 0-15')
        if val is None:
            reg = _DATA_B if pin >= 8 else _DATA_B + 1
            return (self._r(reg) >> (pin & 7)) & 1
        if val:
            self._out |= 1 << pin
        else:
            self._out &= ~(1 << pin)
        reg = _DATA_B if pin >= 8 else _DATA_B + 1
        self._w(reg, (self._out >> (8 if pin >= 8 else 0)) & 0xFF)

    def read_port(self):
        """All 16 pin levels: bits 0-7 = IO0-7, bits 8-15 = IO8-15."""
        return self._r16(_DATA_B)

    def write_port(self, val):
        """Set all 16 output levels (only output-configured pins drive them)."""
        self._out = val & 0xFFFF
        self._w16(_DATA_B, self._out)
