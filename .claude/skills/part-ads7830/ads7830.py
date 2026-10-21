# ADS7830 8-channel 8-bit I2C ADC (Texas Instruments), MicroPython driver.
# From the TI datasheet SBAS302C: write one command byte
#   SD C2 C1 C0 PD1 PD0 X X
# which starts a conversion, then read one byte (straight binary, D7 = MSB).
# Code = Vin * 256 / VREF, so Vin = code * VREF / 256 (1 LSB = VREF / 256).
#
# On the Adafruit breakout (#5836) the REF pin is tied to VIN, so VREF = the supply
# voltage and the internal 2.5 V reference must stay OFF (PD1 = 0, datasheet:
# "If using an external reference, PD1 must be set to '0'"). Pass internal_ref=True
# only if you cut the board's Ext Ref jumper and want the internal 2.5 V reference.
import time

# Single-ended channel select bits C2 C1 C0 for CH0..CH7 (datasheet Table 2, SD = 1)
_SINGLE = (0b000, 0b100, 0b001, 0b101, 0b010, 0b110, 0b011, 0b111)
# Differential pairs (SD = 0): index = (positive, negative) pair, Table 2
_DIFF = {(0, 1): 0b000, (2, 3): 0b001, (4, 5): 0b010, (6, 7): 0b011,
         (1, 0): 0b100, (3, 2): 0b101, (5, 4): 0b110, (7, 6): 0b111}


class ADS7830:
    def __init__(self, i2c, addr=0x48, vref=3.3, internal_ref=False):
        """vref: the voltage on the REF pin (the board's VIN by default)."""
        self.i2c = i2c
        self.addr = addr
        self.internal_ref = internal_ref
        self.vref = 2.5 if internal_ref else vref
        # PD1 PD0: 01 = internal reference OFF, A/D converter ON (external REF)
        #          11 = internal reference ON,  A/D converter ON
        self._pd = 0b11 if internal_ref else 0b01
        if internal_ref:
            # The internal reference turns on after the first command with PD1 = 1
            # and a STOP; it needs settling time before 8-bit accurate results
            # (datasheet Figure 12: tens of ms without a REF capacitor, longer with one).
            self._convert(0x80 | (self._pd << 2))
            time.sleep_ms(50)

    def _convert(self, cmd):
        self.i2c.writeto(self.addr, bytes([cmd]))
        return self.i2c.readfrom(self.addr, 1)[0]

    def read_raw(self, channel):
        """Single-ended conversion of channel 0-7 against COM; returns 0-255."""
        if not 0 <= channel <= 7:
            raise ValueError('channel must be 0-7')
        cmd = 0x80 | (_SINGLE[channel] << 4) | (self._pd << 2)
        return self._convert(cmd)

    def read_diff_raw(self, pos, neg):
        """Differential conversion (pos - neg) of an adjacent pair, e.g. (0, 1); 0-255."""
        c = _DIFF.get((pos, neg))
        if c is None:
            raise ValueError('pair must be CH0/CH1, CH2/CH3, CH4/CH5 or CH6/CH7')
        return self._convert((c << 4) | (self._pd << 2))

    def read_voltage(self, channel):
        """Channel voltage in volts: code * VREF / 256."""
        return self.read_raw(channel) * self.vref / 256
