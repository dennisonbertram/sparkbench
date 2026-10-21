# MCP3004 4-channel 10-bit SPI ADC (Microchip MCP3004/3008, DS21295D), MicroPython driver.
# Uses the datasheet's 3-byte, 8-bit-aligned transfer (Section 6.1, Figure 6-1, SPI mode 0,0):
#   byte 0: 0 0 0 0 0 0 0 START
#   byte 1: SGL/DIFF D2 D1 D0 x x x x   (D2 is "don't care" on the MCP3004, sent as 0)
#   byte 2: x x x x x x x x
# Reply: byte 1 = ? ? ? ? ? NULL B9 B8, byte 2 = B7..B0.
# Code = 1024 * VIN / VREF (Equation 4-2).
from machine import Pin


class MCP3004:
    def __init__(self, spi, cs, vref=3.3):
        """spi: machine.SPI in mode 0 (polarity=0, phase=0), 10 kHz to 1.35 MHz at 2.7 V
        (3.6 MHz max at 5 V). cs: GPIO number of CS/SHDN. vref: voltage on the VREF pin."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.vref = vref
        self._tx = bytearray(3)
        self._rx = bytearray(3)

    def read_raw(self, channel, single_ended=True):
        """Convert one channel and return the 10-bit code (0-1023).
        single_ended=False selects the pseudo-differential pair (Table 5-1)."""
        if not 0 <= channel <= 3:
            raise ValueError('MCP3004 channel must be 0-3')
        self._tx[0] = 0x01  # seven leading zeros, then the start bit
        self._tx[1] = (0x80 if single_ended else 0x00) | ((channel & 0x03) << 4)
        self._tx[2] = 0x00
        self.cs.value(0)
        self.spi.write_readinto(self._tx, self._rx)
        self.cs.value(1)  # CS must go high between conversions (tCSH >= 270 ns)
        return ((self._rx[1] & 0x03) << 8) | self._rx[2]

    def raw_to_volts(self, raw):
        return raw * self.vref / 1024

    def read_volts(self, channel, single_ended=True):
        return self.raw_to_volts(self.read_raw(channel, single_ended))
