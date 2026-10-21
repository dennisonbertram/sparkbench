# ML8511 UV sensor with voltage output (LAPIS / ROHM), MicroPython driver.
# Datasheet FEDL8511-05 (March 2013), VDD = 2.7-3.6 V, Ta = 25 C, lambda = 365 nm:
#   OUT = 1.0 V typical in the dark (0.95-1.05 V)
#   OUT = 2.2 V typical at 10 mW/cm2 (2.08-2.32 V)
# The response is linear (page 4 graph, 0-15 mW/cm2), so
#   UV (mW/cm2) = (Vout - 1.0 V) / 0.12 V per mW/cm2.
# EN is active high: low = standby (OUT low, 0.1 uA). OUT is stable at most 1 ms after EN goes high.
# Load on OUT should be over 100 kOhm (a microcontroller ADC input is fine).
from machine import ADC, Pin
import time

V_DARK = 1.0          # datasheet VREF: output with no UV
V_PER_MW_CM2 = 0.12   # (2.2 V - 1.0 V) / 10 mW/cm2


class ML8511:
    def __init__(self, out_pin, en_pin=None, samples=32, vref=3.3):
        self.adc = ADC(Pin(out_pin) if isinstance(out_pin, int) else out_pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.en = None
        if en_pin is not None:
            self.en = Pin(en_pin, Pin.OUT, value=1)
            time.sleep_ms(1)  # datasheet TSU: output settles within 1 ms of EN high

    def enable(self, on=True):
        """Drive EN high (active) or low (standby, 0.1 uA). Needs en_pin."""
        if self.en is None:
            return
        self.en.value(1 if on else 0)
        if on:
            time.sleep_ms(1)

    def voltage(self):
        """OUT voltage in volts, averaged over several ADC samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def intensity(self):
        """UV intensity in mW/cm2 (calibrated at 365 nm): (Vout - 1.0 V) / 0.12 V. Never below 0."""
        uv = (self.voltage() - V_DARK) / V_PER_MW_CM2
        return uv if uv > 0 else 0.0
