# KY-013 analog temperature module (10 kOhm NTC thermistor, B25/50 = 3950 K, in a divider with a
# fixed 10 kOhm resistor), MicroPython driver.
# Circuit (Joy-IT KY-013 documentation): +V -- 10 kOhm -- S -- NTC -- GND, so
#   V_S = Vcc * R_ntc / (R_ntc + 10 kOhm)   ->   R_ntc = 10 kOhm * (V_S / Vcc) / (1 - V_S / Vcc)
# Temperature from the thermistor's beta equation (R25 = 10 kOhm at 298.15 K, B = 3950 K):
#   1 / T(K) = 1 / 298.15 + ln(R_ntc / R25) / B
# Warmer = lower resistance = lower voltage on S.
import math
from machine import ADC, Pin


class KY013:
    R_FIXED = 10000.0  # ohms, fixed resistor from +V to S
    R25 = 10000.0      # ohms, thermistor at 25 degC
    BETA = 3950.0      # K, B25/50
    T25 = 298.15       # K

    def __init__(self, pin, vcc=3.3, samples=32, vref=3.3):
        """pin: GPIO number (or Pin) wired to S. vcc: the voltage on the module's + pin.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """Averaged voltage on S in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self):
        """Thermistor resistance in ohms, from the divider equation."""
        ratio = self.voltage() / self.vcc
        if ratio <= 0:
            return 0.0  # S shorted to GND (or above ~200 degC)
        if ratio >= 1:
            return float('inf')  # thermistor open / not connected
        return self.R_FIXED * ratio / (1 - ratio)

    def temperature(self):
        """Temperature in degC from the beta equation."""
        r = self.resistance()
        if r <= 0 or r == float('inf'):
            raise ValueError('KY-013: S reads 0 V or full supply, check the wiring')
        inv_t = 1 / self.T25 + math.log(r / self.R25) / self.BETA
        return 1 / inv_t - 273.15
