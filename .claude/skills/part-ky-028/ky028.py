# KY-028 digital temperature module (NTC thermistor + LM393 comparator, 4-pin AO/G/+/DO),
# MicroPython driver.
# AO is the thermistor divider voltage, brought out directly. The NTC is the lower leg of the
# divider, so the signal is inverted: warmer = lower resistance = LOWER voltage on AO
# (Joy-IT KY-028 documentation). Resistor values differ between KY-028 makers, so AO is a
# relative temperature reading, not a calibrated degC value.
# DO is the LM393 comparator output with the module's pull-up: HIGH while the temperature is past
# the threshold set on the blue trimmer (LED2 lit), LOW otherwise (Joy-IT KY-028 documentation).
from machine import ADC, Pin


class KY028:
    def __init__(self, ao=None, do=None, samples=32, vref=3.3):
        """ao/do: GPIO numbers (or Pin objects); either may be None if not wired.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = None
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
            except AttributeError:
                pass
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """AO voltage in volts, averaged over several samples. Lower = warmer."""
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

    def over_threshold(self):
        """True while DO is HIGH, i.e. the temperature is past the trimmer threshold (LED2 lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 1
