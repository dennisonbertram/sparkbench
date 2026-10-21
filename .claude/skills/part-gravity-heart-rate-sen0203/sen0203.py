# DFRobot Gravity Heart Rate Monitor Sensor (SEN0203), MicroPython driver.
# A SON1303 reflective optical sensor (green LED + photodetector) feeds a SON3130 quad op-amp:
# U2A/U2B amplify the blood-volume pulse (photoplethysmography) to the analog output Aout, and
# U2C/U2D form a comparator with hysteresis that turns each beat into a square pulse, Dout.
# The onboard slide switch SW1 picks which one reaches the Signal pin: A = analog, D = digital.
# Output swings 0..VCC (wiki: "0 - Vin (Analog), 0/Vin (Digital)"), so power it from 3.3 V
# on a 3.3 V board.
import time
from machine import ADC, Pin


class SEN0203:
    def __init__(self, signal, mode='analog', vref=3.3):
        """signal: GPIO the Signal wire goes to. mode: 'analog' (switch on A, needs an ADC pin)
        or 'digital' (switch on D, any GPIO)."""
        self.mode = mode
        self.vref = vref
        if mode == 'analog':
            self.adc = ADC(Pin(signal))
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range
            except AttributeError:
                pass
        else:
            self.pin = Pin(signal, Pin.IN)

    def raw(self):
        """Analog mode: raw ADC reading 0..65535. Digital mode: 0 or 1."""
        if self.mode == 'analog':
            return self.adc.read_u16()
        return self.pin.value()

    def voltage(self):
        """Analog mode: Signal voltage in volts."""
        return self.adc.read_u16() * self.vref / 65535

    def bpm(self, beats=4, learn_ms=2000, timeout_ms=10000, period_ms=4):
        """Heart rate in beats per minute from the time between beats, or None if no clear pulse.

        Digital mode times rising edges of the beat pulse. Analog mode first learns the
        waveform's low and high level, then times rising crossings of a threshold at 60 % of
        that range (re-armed below 40 %). Edges closer than 250 ms (over 240 BPM) are ignored."""
        if self.mode == 'analog':
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
            read = self.adc.read_u16
        else:
            up, down = 1, 0
            read = self.pin.value
        armed = False
        edges = []
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            v = read()
            now = time.ticks_ms()
            if not armed and v <= down:
                armed = True
            elif armed and v >= up:
                armed = False
                if not edges or time.ticks_diff(now, edges[-1]) > 250:
                    edges.append(now)
                    if len(edges) > beats:
                        return 60000 * beats / time.ticks_diff(edges[-1], edges[0])
            time.sleep_ms(period_ms)
        return None
