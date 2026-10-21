# Seeed Grove - Sound Sensor v1.6 (SKU 101020023, Grove pins SIG, NC, VCC, GND), MicroPython driver.
# No bus, no registers. From Seeed's v1.6 schematic: an electret microphone (biased by R3 10k from VCC)
# is AC coupled (C3 1 uF, R6 100k to GND) into two LM358 non-inverting stages, each with gain
# 1 + 10k/1k = 11, both referenced to GND on a single supply. The LM358 output swings 0 V to VCC - 1.5 V
# (ST LM358 datasheet), so only the positive half of the sound is amplified. The result then goes through
# C2 220 nF IN SERIES to SIG: SIG is AC coupled and the board gives it no DC level of its own.
# A single reading therefore means nothing; loudness is the peak-to-peak spread of fast samples over a
# short window (50 ms covers frequencies down to 20 Hz), which does not depend on the DC level.
from machine import ADC, Pin
import time


class GroveSound:
    def __init__(self, sig, vref=3.3):
        """sig: GPIO number (or Pin) wired to SIG. vref: ADC full scale in volts, used when
        read_uv() is not available (e.g. Pico, where full scale is the 3.3 V supply)."""
        self.adc = ADC(Pin(sig) if isinstance(sig, int) else sig)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref

    def voltage(self):
        """One SIG reading in volts."""
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def average(self, n=32):
        """Mean of n readings in volts (Seeed's Arduino example averages 32 analogRead() values).
        Because SIG is AC coupled this is only the DC level (the bias divider, if fitted), not loudness."""
        total = 0.0
        for _ in range(n):
            total += self.voltage()
        return total / n

    def peak_to_peak(self, window_ms=50):
        """Spread (max - min) of SIG over window_ms, in volts: the loudness figure.
        About 0 in silence; at most about VCC - 1.5 V (3.5 V on 5 V), limited by the ADC range."""
        lo = hi = self.voltage()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self.voltage()
            if v < lo:
                lo = v
            elif v > hi:
                hi = v
        return hi - lo
