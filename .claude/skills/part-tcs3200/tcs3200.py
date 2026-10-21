# TCS3200 / TCS230 colour sensor module, MicroPython driver.
# The ams/TAOS TCS3200 is a light-to-frequency converter: OUT is a square wave whose
# frequency is proportional to the light on the selected photodiode group.
#   S2 S3: L L red, L H blue, H L clear (no filter), H H green   (datasheet Figure 5)
#   S0 S1: L L power down, L H 2 %, H L 20 %, H H 100 % of the full-scale frequency
#          (full scale typ. 12 kHz / 120 kHz / 600 kHz)
#   OE: active low output enable (high = OUT high-impedance)
# Inputs: VIH >= 2 V, so 3.3 V GPIOs drive them at any VDD. OUT swings to VDD, so power the
# module from 3.3 V when OUT goes to a 3.3 V GPIO. The divided (2 %/20 %) outputs are 50 % duty
# square waves; use 2 % (or 20 %) so a MicroPython interrupt can count every edge.
from machine import Pin
import time

RED, BLUE, CLEAR, GREEN = 0, 1, 2, 3          # value = S2*2 + S3
_SCALE = {0: (0, 0), 2: (0, 1), 20: (1, 0), 100: (1, 1)}


class TCS3200:
    def __init__(self, s0, s1, s2, s3, out, oe=None, scaling=2):
        self.s0 = Pin(s0, Pin.OUT)
        self.s1 = Pin(s1, Pin.OUT)
        self.s2 = Pin(s2, Pin.OUT)
        self.s3 = Pin(s3, Pin.OUT)
        self.oe = Pin(oe, Pin.OUT, value=0) if oe is not None else None  # OE low = output on
        self.out = Pin(out, Pin.IN)
        self._n = 0
        self.scaling(scaling)
        self.out.irq(trigger=Pin.IRQ_RISING, handler=self._edge)

    def _edge(self, p):
        self._n += 1

    def scaling(self, pct):
        """Output frequency scaling: 0 (power down), 2, 20 or 100 (%)."""
        a, b = _SCALE[pct]
        self.s0.value(a)
        self.s1.value(b)
        self.pct = pct

    def enable(self, on=True):
        if self.oe is not None:
            self.oe.value(0 if on else 1)

    def hz(self, colour, window_ms=100):
        """Select a photodiode group (RED/BLUE/CLEAR/GREEN) and return OUT's frequency in Hz,
        counted over window_ms."""
        self.s2.value(colour >> 1)
        self.s3.value(colour & 1)
        # The new period starts one output period (+1 us) after a select change; at the
        # 2 % scale's lowest useful rates a few ms is enough to settle.
        time.sleep_ms(5)
        n0 = self._n
        t0 = time.ticks_us()
        time.sleep_ms(window_ms)
        n = self._n - n0
        dt = time.ticks_diff(time.ticks_us(), t0)
        return n * 1000000 / dt

    def rgbc(self, window_ms=100):
        """(red, green, blue, clear) frequencies in Hz."""
        return (self.hz(RED, window_ms), self.hz(GREEN, window_ms),
                self.hz(BLUE, window_ms), self.hz(CLEAR, window_ms))
