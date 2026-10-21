# MCP3002 2-channel 10-bit SPI ADC (Microchip MCP3002, DS21294E), MicroPython driver.
# Uses the datasheet's 2-byte, 8-bit-aligned transfer (Section 6.1, Figure 6-1, SPI mode 0,0):
#   sent:     0 START SGL/DIFF ODD/SIGN MSBF x x x | x x x x x x x x
#   received: ? ? ? ? ? NULL B9 B8                 | B7 B6 B5 B4 B3 B2 B1 B0
# The leading zero before the start bit puts the 10-bit result in the low bits.
# VDD is also the reference: Code = 1024 * VIN / VDD (Section 4.2).
from machine import Pin


class MCP3002:
    def __init__(self, spi, cs, vdd=3.3):
        """spi: machine.SPI in mode 0 (polarity=0, phase=0), 10 kHz to 1.2 MHz at 2.7 V
        (3.2 MHz max at 5 V). cs: GPIO number of CS/SHDN. vdd: voltage on the VDD/VREF pin."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.vdd = vdd
        self._tx = bytearray(2)
        self._rx = bytearray(2)

    def read_raw(self, channel, single_ended=True):
        """Convert one channel and return the 10-bit code (0-1023).
        single_ended=False selects pseudo-differential mode (Table 5-1):
        channel 0 = CH0 is IN+ / CH1 is IN-, channel 1 = CH1 is IN+ / CH0 is IN-."""
        if channel not in (0, 1):
            raise ValueError('MCP3002 channel must be 0 or 1')
        # 0b0 1 SGL ODD MSBF 000: start bit, mode, channel, MSB-first only
        self._tx[0] = 0x40 | (0x20 if single_ended else 0x00) | (channel << 4) | 0x08
        self._tx[1] = 0x00
        self.cs.value(0)
        self.spi.write_readinto(self._tx, self._rx)
        self.cs.value(1)  # CS must go high between conversions (tCSH >= 310 ns)
        return ((self._rx[0] & 0x03) << 8) | self._rx[1]

    def raw_to_volts(self, raw):
        return raw * self.vdd / 1024

    def read_volts(self, channel, single_ended=True):
        return self.raw_to_volts(self.read_raw(channel, single_ended))
