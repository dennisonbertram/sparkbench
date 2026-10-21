# MAX31855 cold-junction-compensated thermocouple-to-digital converter, MicroPython driver.
# Read-only SPI, mode 0 (CPOL=0, CPHA=0), SCK up to 5 MHz. While CS is low the chip shifts out
# one 32-bit frame MSB first (datasheet Table 2):
#   D31..D18 signed 14-bit thermocouple temperature, 0.25 degC per LSB
#   D17 reserved (0), D16 fault (1 = any of SCV/SCG/OC)
#   D15..D4  signed 12-bit internal (cold-junction) temperature, 0.0625 degC per LSB
#   D3 reserved (0), D2 SCV (short to VCC), D1 SCG (short to GND), D0 OC (open circuit)
# Conversions run continuously (70-100 ms each); results only update while CS is high.
from machine import Pin
import time


class MAX31855:
    def __init__(self, spi, cs):
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self._buf = bytearray(4)
        time.sleep_ms(200)  # tCONV_PU: first valid conversion needs 200 ms after power-up

    def raw(self):
        """Read the 32-bit frame."""
        self.cs.value(0)
        self.spi.readinto(self._buf)
        self.cs.value(1)
        b = self._buf
        return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]

    def read(self):
        """Return (thermocouple degC, cold-junction degC). Raises OSError on a thermocouple fault."""
        v = self.raw()
        if v & 0x00010000:
            if v & 0x1:
                why = 'open circuit (thermocouple not connected)'
            elif v & 0x2:
                why = 'thermocouple shorted to GND'
            elif v & 0x4:
                why = 'thermocouple shorted to VCC'
            else:
                why = 'fault'
            raise OSError('MAX31855: ' + why)
        tc = (v >> 18) & 0x3FFF
        if tc & 0x2000:
            tc -= 0x4000
        cj = (v >> 4) & 0xFFF
        if cj & 0x800:
            cj -= 0x1000
        return tc * 0.25, cj * 0.0625

    def temperature(self):
        return self.read()[0]

    def internal(self):
        return self.read()[1]
