# KY-038 microphone sound sensor module (electret microphone + LM393 comparator, 4-pin AO/G/+/DO),
# MicroPython driver.
# AO is the microphone signal straight from the electret/bias-resistor node: a DC level with the
# audio riding on it. Louder sound = bigger swing around that level, so loudness is best measured
# as the peak-to-peak spread of fast samples, not as a single reading.
# DO is the LM393 comparator output with the module's pull-up: HIGH while the signal is past the
# threshold set on the blue trimmer (LED2 lit), LOW otherwise (Joy-IT KY-038 documentation).
from machine import ADC, Pin


class KY038:
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

    def _read_v(self):
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def voltage(self):
        """AO voltage in volts, averaged over several samples (the DC level of the microphone node)."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        total = 0
        for _ in range(self.samples):
            total += self._read_v()
        return total / self.samples

    def peak_to_peak(self, n=200):
        """Spread (max - min) of n quick AO samples in volts: a rough loudness figure."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        lo = hi = self._read_v()
        for _ in range(n - 1):
            v = self._read_v()
            if v < lo:
                lo = v
            elif v > hi:
                hi = v
        return hi - lo

    def detected(self):
        """True while DO is HIGH, i.e. the sound is past the trimmer threshold (LED2 lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 1
