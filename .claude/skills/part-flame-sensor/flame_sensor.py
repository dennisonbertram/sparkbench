# KY-026 flame sensor module (IR phototransistor + LM393 comparator, 4-pin AO/G/+/DO),
# MicroPython driver.
# The 5 mm black IR phototransistor (YG1006-type, 760-1100 nm) sits in a divider with a resistor to
# the supply. More infrared (a closer or bigger flame) makes it conduct harder, so the AO voltage
# FALLS as the flame gets stronger (Joy-IT: "the signal is inverted"). AO is near the supply voltage
# with no flame.
# One half of the LM393 (TI datasheet: open-collector output) compares that voltage with the blue
# trimmer; on the Joy-IT KY-026 DO goes HIGH and LED2 lights when a flame is detected.
# Some clones invert DO: pass active_high=False for those.
# There is no calibration: AO depends on the supply, ambient light (sunlight and lamps contain IR)
# and the trimmer, so record your own no-flame and flame readings.
from machine import ADC, Pin


class FlameSensor:
    def __init__(self, ao=None, do=None, active_high=True, samples=16, vref=3.3):
        """ao/do: GPIO numbers (or Pin objects); either may be None if not wired.
        active_high: True if DO is HIGH on flame (Joy-IT KY-026), False for clones where it is LOW.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = None
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
            except AttributeError:
                pass
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.active_high = active_high
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """AO voltage in volts, averaged: high = no IR, lower = stronger flame / IR."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def intensity(self, vcc=3.3):
        """Rough IR level 0-100 %: 0 = AO at the supply (no IR), 100 = AO at 0 V (saturated)."""
        i = (1 - self.voltage() / vcc) * 100
        return min(100.0, max(0.0, i))

    def flame(self):
        """True when DO reports a flame past the trimmer threshold (LED2 lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == (1 if self.active_high else 0)
