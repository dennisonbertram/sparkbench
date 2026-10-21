# Seeed Grove - Loudness Sensor (v0.9b, Grove pins SIG, NC, VCC, GND), MicroPython driver.
# No bus, no registers: an electret/MEMS microphone feeds an LM2904 dual op-amp (TI datasheet).
# From the Seeed schematic: U1A is a unity-gain buffer and U1B a non-inverting amplifier
# (gain 1 + 560k / (1k + 1k trimmer)), both with their inputs referenced to GND on a single supply,
# so only the positive half of the audio is amplified. R6 47k + C3 1 uF (47 ms) then smooth it into a
# positive ENVELOPE on SIG: about 0 V in silence, rising with loudness, up to the LM2904's
# high-level output limit (about VCC - 1.5 V, so ~3.5 V on a 5 V supply).
# Loudness is therefore read as a DC level: average a few fast samples to remove the ripple.
from machine import ADC, Pin
import time


class GroveLoudness:
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

    def level(self, window_ms=50):
        """Envelope level in volts: SIG averaged over window_ms (about one RC time constant).
        Near 0 V in silence, larger for louder sound."""
        total = 0.0
        n = 0
        t0 = time.ticks_ms()
        while True:
            total += self.voltage()
            n += 1
            if time.ticks_diff(time.ticks_ms(), t0) >= window_ms:
                break
        return total / n

    def peak(self, window_ms=50):
        """Highest SIG reading over window_ms, in volts (catches short sounds such as claps)."""
        hi = self.voltage()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self.voltage()
            if v > hi:
                hi = v
        return hi

    def raw10(self, vcc=5.0):
        """Level as the 0-1023 number the Seeed Arduino examples print (10-bit ADC with vcc full scale)."""
        return min(1023, int(self.level() * 1023 / vcc + 0.5))
