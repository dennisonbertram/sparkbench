# PCF8591 8-bit 4-channel ADC + 1-channel DAC (NXP PCF8591 datasheet Rev. 7)
# I2C address 0x48 (1001 A2 A1 A0, all tied low on the YL-40 module).
#
# Control byte (datasheet Fig. 4):
#   bit 6    analog output (AOUT/DAC) enable
#   bits 5-4 input programming (00 = four single-ended inputs)
#   bit 2    auto-increment
#   bits 1-0 A/D channel number
# A conversion starts after each read-address acknowledge, so the FIRST byte of every
# read is the result of the PREVIOUS read cycle (0x80 after power-on). We read two bytes
# and keep the second, which is a fresh conversion of the channel just selected.
# Single-ended code = (Vin - VAGND) / Vlsb, Vlsb = (VREF - VAGND) / 256.

ADDR = 0x48
_AOUT_EN = 0x40


class PCF8591:
    def __init__(self, i2c, addr=ADDR, vref=3.3):
        # On the YL-40, VREF is wired to VCC and AGND to GND: pass the module's supply voltage.
        self.i2c = i2c
        self.addr = addr
        self.vref = vref
        self._ctrl = 0x00  # single-ended, AOUT off (power-on state)
        self._dac = 0

    def read(self, channel):
        """Raw 8-bit code (0-255) of AIN<channel>, single-ended."""
        if not 0 <= channel <= 3:
            raise ValueError('channel must be 0-3')
        self.i2c.writeto(self.addr, bytes([self._ctrl | channel]))
        b = self.i2c.readfrom(self.addr, 2)
        return b[1]

    def read_voltage(self, channel):
        """AIN<channel> in volts (0 V to vref - 1 LSB)."""
        return self.read(channel) * self.vref / 256

    def write_dac(self, value):
        """Set AOUT to value/256 x VREF (0-255) and enable the output buffer."""
        self._dac = max(0, min(255, int(value)))
        self._ctrl |= _AOUT_EN
        self.i2c.writeto(self.addr, bytes([self._ctrl, self._dac]))

    def dac_off(self):
        """Switch AOUT to high impedance (lowest supply current)."""
        self._ctrl &= ~_AOUT_EN
        self.i2c.writeto(self.addr, bytes([self._ctrl]))
