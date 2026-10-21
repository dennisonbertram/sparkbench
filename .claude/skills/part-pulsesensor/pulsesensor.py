# PulseSensor (World Famous Electronics, PulseSensor.com) optical heart-rate sensor, MicroPython driver.
# The sensor is a green LED + APDS-9008 light sensor + op-amp stage: its purple Signal wire is an
# analog photoplethysmogram (PPG) that rests near Vdd/2 and rises with each heartbeat
# (datasheet: output 0.3 V .. Vdd, typical Vdd/2). Power it from 3.3 V so Signal never exceeds 3.3 V.
import time
from machine import ADC, Pin


class PulseSensor:
    def __init__(self, signal, vref=3.3):
        self.adc = ADC(Pin(signal))
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range
        except AttributeError:
            pass
        self.vref = vref

    def raw(self):
        """Raw ADC reading, 0..65535."""
        return self.adc.read_u16()

    def voltage(self):
        """Signal voltage in volts (about Vdd/2 = 1.65 V between beats on a 3.3 V supply)."""
        return self.adc.read_u16() * self.vref / 65535

    def bpm(self, beats=4, learn_ms=2000, timeout_ms=10000, period_ms=4):
        """Heart rate in beats per minute from the time between beats, or None if no clear pulse.

        Learns the waveform's low and high level first, then times `beats` intervals between
        rising crossings of a threshold at 60 % of that range (re-armed below 40 %),
        ignoring crossings closer than 250 ms (faster than 240 BPM)."""
        lo, hi = 65535, 0
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < learn_ms:
            v = self.adc.read_u16()
            lo = min(lo, v)
            hi = max(hi, v)
            time.sleep_ms(period_ms)
        if hi - lo < 2000:  # under about 0.1 V of swing: no finger / no usable pulse
            return None
        up = lo + (hi - lo) * 6 // 10
        down = lo + (hi - lo) * 4 // 10
        armed = False
        edges = []
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            v = self.adc.read_u16()
            now = time.ticks_ms()
            if not armed and v < down:
                armed = True
            elif armed and v > up:
                armed = False
                if not edges or time.ticks_diff(now, edges[-1]) > 250:
                    edges.append(now)
                    if len(edges) > beats:
                        return 60000 * beats / time.ticks_diff(edges[-1], edges[0])
            time.sleep_ms(period_ms)
        return None
