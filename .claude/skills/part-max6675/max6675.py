# MAX6675 cold-junction-compensated K-type thermocouple-to-digital converter, MicroPython driver.
# Written from the Maxim/Analog Devices MAX6675 datasheet (19-2235):
#  - CS low stops any conversion and puts D15 on SO; 16 clocks read D15..D0 MSB first.
#  - CS high starts a new conversion, which takes up to 0.22 s.
#  - D15 = dummy sign bit (always 0), D14..D3 = 12-bit temperature, 0.25 degC per LSB,
#    D2 = 1 when the thermocouple input is open, D1 = device ID (always 0), D0 = three-state.
#  - SCK up to 4.3 MHz; SO changes after SCK falls, so read in SPI mode 0.
from machine import Pin
import time

CONVERSION_MS = 220  # datasheet maximum conversion time


class MAX6675:
    def __init__(self, spi, cs):
        """spi: a machine.SPI (mode 0, <= 4.3 MHz) with SO on MISO; cs: GPIO number or Pin."""
        self.spi = spi
        self.cs = cs if isinstance(cs, Pin) else Pin(cs, Pin.OUT, value=1)
        self.cs.value(1)  # CS high starts the first conversion (pass a Pin already set to Pin.OUT)
        self._started = time.ticks_ms()

    def read_raw(self):
        """Return the 16-bit word D15..D0, waiting for a conversion to finish first."""
        wait = CONVERSION_MS - time.ticks_diff(time.ticks_ms(), self._started)
        if wait > 0:
            time.sleep_ms(wait)
        self.cs.value(0)
        b = self.spi.read(2)
        self.cs.value(1)  # start the next conversion
        self._started = time.ticks_ms()
        return (b[0] << 8) | b[1]

    def read(self):
        """Thermocouple temperature in degC (0 to 1023.75, 0.25 degC steps)."""
        raw = self.read_raw()
        if raw & 0x8002:
            # D15 and D1 are always 0 on a working MAX6675; 1s mean SO is floating.
            raise OSError('MAX6675 not responding: check SO, SCK, CS and power')
        if raw & 0x0004:
            raise OSError('thermocouple open: check the probe on T+ / T-')
        return ((raw >> 3) & 0x0FFF) * 0.25
