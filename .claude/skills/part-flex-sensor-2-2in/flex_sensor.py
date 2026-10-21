# Spectra Symbol 2.2" flex sensor (FS-L-0055-253-ST, Adafruit 1070), MicroPython driver.
# The sensor is a plain resistor: about 25 kOhm flat (+/-30 %), rising to 45-125 kOhm when bent,
# depending on bend radius (Spectra Symbol datasheet). Read it as a voltage divider:
#   pin 1 -> 3.3 V, pin 2 -> ADC input and a fixed resistor R_LOAD (47 kOhm) to GND.
#   V(ADC) = VCC * R_LOAD / (R_LOAD + R_FLEX)
#   R_FLEX = R_LOAD * (VCC - V) / V
# The datasheet gives no angle formula: angle() interpolates linearly between two calibration
# points (flat resistance and resistance at 90 degrees). Defaults are the typical 25 kOhm flat and
# about 100 kOhm fully bent (Adafruit); measure your own sensor and pass r_flat / r_bent.
from machine import ADC, Pin


class FlexSensor:
    def __init__(self, pin, r_load=47000, vcc=3.3, r_flat=25000, r_bent=100000, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.r_load = r_load
        self.vcc = vcc
        self.r_flat = r_flat
        self.r_bent = r_bent
        self.samples = samples

    def volts(self):
        """Average several samples and return the divider voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vcc / 65535
        return total / self.samples

    def resistance(self, v=None):
        """Flex sensor resistance in ohms, or None if the sensor looks open (V near 0)."""
        if v is None:
            v = self.volts()
        if v < 0.01:
            return None
        if v >= self.vcc:
            return 0.0
        return self.r_load * (self.vcc - v) / v

    def angle(self, r=None):
        """Approximate bend angle in degrees from the two-point calibration (0 = flat)."""
        if r is None:
            r = self.resistance()
        if r is None:
            return None
        return (r - self.r_flat) * 90 / (self.r_bent - self.r_flat)
