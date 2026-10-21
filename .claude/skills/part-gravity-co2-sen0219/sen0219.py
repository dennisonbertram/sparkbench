# DFRobot Gravity: Analog Infrared CO2 Sensor (SEN0219, analog-output version), MicroPython driver.
# DFRobot wiki: with a 5 V supply the NDIR module outputs 0.4-2.0 V for 0-5000 ppm CO2, linear,
# and 0 V when its self-check finds a fault. DFRobot's sample code:
#     concentration = (mV - 400) * 50 / 16      (ppm)
# Below 0.4 V (but above 0 V) the sensor is still preheating.
# The output never exceeds 2.0 V, so it can go straight to a 3.3 V ADC pin; only the supply needs 5 V.
from machine import ADC, Pin

V_ZERO = 0.4      # V at 0 ppm
V_SPAN = 1.6      # V from 0 to 5000 ppm
PPM_SPAN = 5000


class SEN0219:
    FAULT = 'fault'
    PREHEAT = 'preheating'

    def __init__(self, pin, samples=32, vref=3.3):
        """pin: GPIO number (or Pin) wired to the Signal pin. vref: ADC full scale when read_uv() is missing."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """Signal voltage in volts, averaged over several ADC samples (the output is noisy)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def status(self, v=None):
        """'fault' (output ~0 V), 'preheating' (below 0.4 V) or 'ok'."""
        v = self.voltage() if v is None else v
        if v < 0.05:
            return self.FAULT
        if v < V_ZERO - 0.01:
            return self.PREHEAT
        return 'ok'

    def ppm(self):
        """CO2 concentration in ppm, or None while faulted / preheating."""
        v = self.voltage()
        if self.status(v) != 'ok':
            return None
        return max(0.0, (v - V_ZERO) * PPM_SPAN / V_SPAN)
