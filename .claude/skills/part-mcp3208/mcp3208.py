# MCP3208 8-channel 12-bit SPI ADC (Microchip MCP3204/3208, DS21298E), MicroPython driver.
# Uses the datasheet's 3-byte, 8-bit-aligned transfer (Section 6.1, Figure 6-1, SPI mode 0,0):
#   byte 0: 0 0 0 0 0 START SGL/DIFF D2
#   byte 1: D1 D0 x x x x x x
#   byte 2: x x x x x x x x
# Reply: byte 1 = ? ? ? NULL B11 B10 B9 B8, byte 2 = B7..B0.
# Code = 4096 * VIN / VREF (Equation 4-1).
from machine import Pin


class MCP3208:
    def __init__(self, spi, cs, vref=3.3):
        """spi: machine.SPI in mode 0 (polarity=0, phase=0), 10 kHz to 1 MHz at 2.7 V
        (2 MHz max at 5 V). cs: GPIO number of CS/SHDN. vref: voltage on the VREF pin."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.vref = vref
        self._tx = bytearray(3)
        self._rx = bytearray(3)

    def read_raw(self, channel, single_ended=True):
        """Convert one channel and return the 12-bit code (0-4095).
        single_ended=False selects the pseudo-differential pair (Table 5-2)."""
        if not 0 <= channel <= 7:
            raise ValueError('MCP3208 channel must be 0-7')
        self._tx[0] = 0x04 | (0x02 if single_ended else 0x00) | ((channel >> 2) & 0x01)
        self._tx[1] = (channel & 0x03) << 6
        self._tx[2] = 0x00
        self.cs.value(0)
        self.spi.write_readinto(self._tx, self._rx)
        self.cs.value(1)  # CS high ends the conversion (tCSH >= 500 ns)
        return ((self._rx[1] & 0x0F) << 8) | self._rx[2]

    def raw_to_volts(self, raw):
        return raw * self.vref / 4096

    def read_volts(self, channel, single_ended=True):
        return self.raw_to_volts(self.read_raw(channel, single_ended))
