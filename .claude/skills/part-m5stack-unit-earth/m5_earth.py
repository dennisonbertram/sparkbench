# M5Stack Unit Earth (SKU U019) soil moisture sensor, MicroPython driver.
# Circuit (M5Stack U019 schematic V1.0): an HT7533 regulator makes 3.3 V from the 5 V port pin.
# The two probes (EARTH_PIN) sit between Ain and GND, with R1 10 kOhm from Ain to 3.3 V, so Ain is
# about 3.3 V in air / dry soil and FALLS as wet soil conducts between the probes.
# An LM393 comparator (U1A) has Ain on its + input and the 10 kOhm trimmer wiper on its - input.
# Its open-collector output Din has R2 10 kOhm to 3.3 V: Din is HIGH while Ain is above the
# trimmer threshold (dry) and LOW when Ain drops below it (wet). Both signals stay within 3.3 V.
# M5Stack gives no volts-to-moisture formula: calibrate dry and wet readings in your own soil.
from machine import ADC, Pin


class UnitEarth:
    def __init__(self, ain, din=None, samples=16, vref=3.3, vcc=3.3):
        """ain/din: GPIO numbers (or Pin objects) the Ain (white) and Din (yellow) wires go to.
        din may be None. vcc: the unit's internal rail (3.3 V from its HT7533)."""
        self.adc = None
        if ain is not None:
            self.adc = ADC(Pin(ain) if isinstance(ain, int) else ain)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
            except AttributeError:
                pass
        self.din = None if din is None else (Pin(din, Pin.IN) if isinstance(din, int) else din)
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.vcc = vcc

    def raw(self):
        """One 16-bit ADC reading (0-65535): lower = wetter."""
        return self.adc.read_u16()

    def voltage(self):
        """Ain voltage in volts, averaged: about 3.3 V dry, lower = wetter."""
        if self.adc is None:
            raise ValueError('Ain pin not given')
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def moisture(self):
        """Rough wetness 0-100 %: 0 = Ain at the 3.3 V rail (open probes), 100 = Ain at 0 V (shorted)."""
        m = (1 - self.voltage() / self.vcc) * 100
        return min(100.0, max(0.0, m))

    def wet(self):
        """True when Din is LOW: Ain is below the trimmer threshold (soil wetter than the set point)."""
        if self.din is None:
            raise ValueError('Din pin not given')
        return self.din.value() == 0
