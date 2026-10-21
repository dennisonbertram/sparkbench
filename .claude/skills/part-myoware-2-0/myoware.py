# MyoWare 2.0 Muscle Sensor (SparkFun DEV-21265 / DEV-27924, Advancer Technologies), MicroPython driver.
# The MyoWare 2.0 is a purely analog EMG front end (no bus, no registers). Per the MyoWare 2.0
# Advanced Guide: instrumentation amp (G = 200) -> 20.8-498.4 Hz band-pass -> full-wave rectifier ->
# 3.6 Hz envelope detector -> adjustable gain stage (G = 200 * R / 1 kOhm, set by the GAIN pot).
# ENV (1x3 header VIN, GND, ENV on the back) is that envelope: near 0 V with the muscle relaxed,
# rising toward VIN the harder the muscle is flexed. Power VIN from 3.3 V so ENV never exceeds 3.3 V.
from machine import ADC, Pin
import time


class MyoWare:
    def __init__(self, env, vref=3.3):
        """env: GPIO number (or Pin) wired to ENV. vref: ADC full scale in volts, used when
        read_uv() is not available (e.g. Pico, where full scale is the 3.3 V supply)."""
        self.adc = ADC(Pin(env) if isinstance(env, int) else env)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref
        self.rest = 0.0

    def voltage(self):
        """One ENV reading in volts."""
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def envelope(self, n=16, gap_us=200):
        """ENV in volts averaged over n samples (the envelope is already smoothed at 3.6 Hz,
        so a short average only removes ADC noise)."""
        total = 0.0
        for _ in range(n):
            total += self.voltage()
            time.sleep_us(gap_us)
        return total / n

    def calibrate_rest(self, ms=1000):
        """Average ENV over `ms` with the muscle relaxed and store it as the resting level."""
        total = 0.0
        count = 0
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < ms:
            total += self.voltage()
            count += 1
            time.sleep_ms(5)
        self.rest = total / count if count else 0.0
        return self.rest

    def activation(self):
        """ENV above the resting level, in volts (never below 0)."""
        return max(0.0, self.envelope() - self.rest)

    def flexed(self, threshold=0.5):
        """True when ENV is more than `threshold` volts above the resting level."""
        return self.activation() > threshold
