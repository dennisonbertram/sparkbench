# KY-039 heartbeat sensor (IR LED + phototransistor), MicroPython driver.
# The module has no chip: an IR LED shines through a fingertip onto a phototransistor that has a
# resistor R from +V to its collector (Joy-IT KY-039 documentation). S is the collector voltage:
# more light -> transistor conducts more -> S lower; less light -> S closer to +V.
# Each heartbeat pushes more blood into the fingertip, which absorbs more IR, so S shows a small
# sharp positive peak once per beat (a few hundred mV on Joy-IT's oscilloscope trace) riding on a
# DC level that depends on the finger and ambient light.
# This driver samples S, tracks the signal's recent minimum and maximum, and counts a beat each
# time S rises through 60 % of that span (re-armed below 40 %). Heart rate = beats per minute
# from the average time between beats.
import time
from machine import ADC, Pin


class KY039:
    def __init__(self, pin, vref=3.3, sample_ms=10):
        """pin: GPIO number (or Pin) wired to S. vref: ADC full scale in volts (3.3 V on the
        ESP32 with 11 dB attenuation and on the Pico). sample_ms: time between samples."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref
        self.sample_ms = sample_ms
        self.pp = 0.0  # last measured peak-to-peak swing of S, volts

    def voltage(self):
        """One reading of S in volts."""
        return self.adc.read_u16() * self.vref / 65535

    def bpm(self, beats=5, timeout_ms=15000, settle_ms=2000, min_pp=0.02, decay=0.003):
        """Measure the heart rate: wait settle_ms for the tracker to learn the signal, then time
        `beats` beat-to-beat intervals. Returns beats per minute, or None if no steady pulse
        (finger missing, swing below min_pp volts) was found within timeout_ms."""
        v = self.voltage()
        hi = lo = v
        armed = False
        times = []
        last_beat = None
        start = time.ticks_ms()
        while True:
            now = time.ticks_ms()
            el = time.ticks_diff(now, start)
            if el > timeout_ms:
                return None
            v = self.voltage()
            # Peak/valley trackers that slowly relax toward each other so the
            # threshold follows drift in the DC level.
            span = hi - lo
            hi = v if v > hi else hi - span * decay
            lo = v if v < lo else lo + span * decay
            span = hi - lo
            self.pp = span
            if span >= min_pp:
                if armed and v > lo + 0.6 * span:
                    armed = False
                    # Ignore a second trigger within 250 ms (above 240 BPM it is noise).
                    if el >= settle_ms and (last_beat is None or time.ticks_diff(now, last_beat) > 250):
                        times.append(now)
                        if len(times) > beats:
                            total = time.ticks_diff(times[-1], times[0])
                            return 60000 * beats / total
                    last_beat = now
                elif not armed and v < lo + 0.4 * span:
                    armed = True
            time.sleep_ms(self.sample_ms)
