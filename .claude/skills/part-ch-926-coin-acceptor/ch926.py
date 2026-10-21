# CH-926 multi-coin acceptor (pulse output), MicroPython driver.
# Per the CH-926 manual: each accepted coin produces a train of P pulses on the white COIN
# wire, where P (1-50) is programmed per coin type ("P" menu). The three-way switch sets the
# pulse length: FAST 20 ms, MEDIUM 50 ms, SLOW 100 ms; the two-way switch selects NO or NC.
# The COIN output is an open-collector transistor: with the switch on NO it is open while idle
# and pulls the wire to GND for each pulse, so it needs a pull-up to the 3.3 V logic supply
# (GPIO internal pull-up, or 10 kOhm to 3V3) and is counted on falling edges.
# A pulse train is over once no new pulse has started for gap_ms (default 4 pulse lengths,
# at least 200 ms); poll() then returns how many pulses that coin produced.
import machine
from machine import Pin
import time

PULSE_MS = {'fast': 20, 'medium': 50, 'slow': 100}


class CoinAcceptor:
    def __init__(self, pin, speed='medium', gap_ms=None, pull_up=True, nc=False):
        """pin: GPIO number (or Pin) wired to COIN. speed: the acceptor's pulse switch
        ('fast' 20 ms, 'medium' 50 ms, 'slow' 100 ms). nc=True if the NO/NC switch is on NC
        (pulses then release the line high instead of pulling it low)."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.pulse_ms = PULSE_MS[speed]
        self.gap_ms = gap_ms if gap_ms is not None else max(200, 4 * self.pulse_ms)
        # Ignore a second edge sooner than half a pulse length (noise on long leads).
        self.glitch_ms = self.pulse_ms // 2
        self._count = 0
        self._total = 0
        self._last = time.ticks_ms()
        trig = Pin.IRQ_RISING if nc else Pin.IRQ_FALLING
        self.pin.irq(trigger=trig, handler=self._on_edge)

    def _on_edge(self, p):
        now = time.ticks_ms()
        if self._count and time.ticks_diff(now, self._last) < self.glitch_ms:
            return
        self._count += 1
        self._total += 1
        self._last = now

    def poll(self):
        """Return the pulse count of a finished coin (pulse train), or 0 if none is complete."""
        s = machine.disable_irq()
        n = self._count
        done = n and time.ticks_diff(time.ticks_ms(), self._last) >= self.gap_ms
        if done:
            self._count = 0
        machine.enable_irq(s)
        return n if done else 0

    def total_pulses(self):
        """All pulses counted since start-up (e.g. credits, if 1 pulse = 1 credit)."""
        return self._total
