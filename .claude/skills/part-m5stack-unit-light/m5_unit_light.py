# M5Stack Unit Light (SKU U021), MicroPython driver.
# Circuit (M5Stack schematic UNIT_LIGHTNESS V1.0):
#   - an HT7533 regulator makes 3.3 V from the 5V Grove pin;
#   - AO ("Ain") is a divider: R1 = 10 kOhm from 3.3 V to AO, photoresistor from AO to GND,
#     so AO = 3.3 V * R_ldr / (10k + R_ldr). Brighter light -> lower LDR resistance -> LOWER AO.
#   - DO ("Din") is an LM393 comparator (IN+ = AO, IN- = 10 kOhm trimmer wiper) with a 10 kOhm
#     pull-up to the unit's 3.3 V: HIGH when AO is above the trimmer (darker than the threshold),
#     LOW when brighter. Both outputs stay within 3.3 V, safe for an ESP32 or Pico.
# AO is not calibrated in lux: it is a relative light level.
from machine import ADC, Pin

R_TOP = 10000      # R1, ohms (schematic)
V_UNIT = 3.3       # unit's regulated rail (HT7533)


class UnitLight:
    def __init__(self, ao=None, do=None, samples=16, vref=3.3):
        """ao: GPIO wired to AO (white wire), do: GPIO wired to DO (yellow wire); either may be None.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = None
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
            except AttributeError:
                pass
        # DO has a 10 kOhm pull-up on the unit; no internal pull needed.
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.samples = samples
        self.vref = vref

    def _read_v(self):
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def voltage(self):
        """AO voltage in volts (averaged). Lower = brighter."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        total = 0
        for _ in range(self.samples):
            total += self._read_v()
        return total / self.samples

    def resistance(self):
        """Photoresistor resistance in ohms from the divider: R = 10k * V / (3.3 - V).
        Returns None when AO is at the rail (LDR open / complete darkness)."""
        v = self.voltage()
        if v >= V_UNIT - 0.01:
            return None
        return R_TOP * v / (V_UNIT - v)

    def brightness(self):
        """Relative light level 0-100 % (100 = AO at 0 V, brightest)."""
        v = self.voltage()
        p = (V_UNIT - v) * 100 / V_UNIT
        return 0.0 if p < 0 else (100.0 if p > 100 else p)

    def dark(self):
        """True while DO is HIGH: darker than the trimmer threshold."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 1

    def bright(self):
        """True while DO is LOW: brighter than the trimmer threshold."""
        return not self.dark()
