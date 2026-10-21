# AD8232 single-lead heart rate (ECG) monitor, MicroPython driver.
# Written for the SparkFun AD8232 Single Lead Heart Rate Monitor (SEN-12650) and its clones:
# OUTPUT is the analog ECG (centred on REFOUT = VS/2, gain 1100, 0.5-40 Hz band),
# LO+ / LO- are the DC leads-off comparator outputs (high = that electrode is off),
# SDN is the active-low shutdown input (pulled up by 10 k on the board).
import time
from machine import ADC, Pin


class AD8232:
    def __init__(self, output, lo_plus=None, lo_minus=None, sdn=None):
        self.adc = ADC(Pin(output))
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range
        except AttributeError:
            pass
        self.lo_plus = Pin(lo_plus, Pin.IN) if lo_plus is not None else None
        self.lo_minus = Pin(lo_minus, Pin.IN) if lo_minus is not None else None
        self.sdn = Pin(sdn, Pin.OUT, value=1) if sdn is not None else None

    def voltage(self):
        """OUTPUT pin voltage in volts (about 1.65 V at rest on a 3.3 V supply)."""
        return self.adc.read_u16() * 3.3 / 65535

    def leads_off(self):
        """True when LO+ or LO- is high (DC leads-off mode: an electrode is disconnected)."""
        for p in (self.lo_plus, self.lo_minus):
            if p is not None and p.value():
                return True
        return False

    def shutdown(self, off=True):
        """Drive SDN low (off=True) for the 40 nA shutdown mode, high to run again."""
        if self.sdn is None:
            raise ValueError('SDN pin not given')
        self.sdn.value(0 if off else 1)

    def bpm(self, beats=4, learn_ms=2000, timeout_ms=10000, period_ms=4):
        """Heart rate in beats per minute from the time between R-peaks, or None if no clear beat.

        Learns the signal's low and high level first, then times `beats` intervals between
        rising crossings of a threshold at 60 % of that range (re-armed below 40 %),
        ignoring crossings closer than 250 ms (faster than 240 BPM)."""
        if self.leads_off():
            return None
        lo, hi = 65535, 0
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < learn_ms:
            v = self.adc.read_u16()
            lo = min(lo, v)
            hi = max(hi, v)
            time.sleep_ms(period_ms)
        if hi - lo < 3000:  # under about 0.15 V of swing: no usable ECG
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
