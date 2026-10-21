# KY-040 rotary encoder module, MicroPython driver.
# The module is a mechanical incremental encoder (two contacts A/CLK and B/DT to common C/GND,
# 10 kOhm pull-ups to + on the board) plus a push switch SW to GND (pull-up usually NOT fitted).
# Contact closed = pin low. Outputs are 2-bit Gray code: turning clockwise, CLK changes before DT:
#   (CLK,DT) = 11 -> 01 -> 00 -> 10 -> 11   (one full quadrature cycle)
# Every edge on either line is decoded with a full state table, so contact bounce (A->B->A)
# cancels itself out instead of adding counts.
# Common modules give 20 pulses / 20 detents per turn (4 edges per click, rest state 11).
# Some give 30 detents / 15 pulses (2 edges per click, rest at 11 or 00): pass steps_per_detent=2.
from machine import Pin

# Index = (old_state << 2) | new_state, state = (CLK << 1) | DT. +1 = clockwise edge, -1 = CCW,
# 0 = no change or an invalid double change (both lines flipped: direction unknown, ignored).
_TABLE = (0, -1, 1, 0,
          1, 0, 0, -1,
          -1, 0, 0, 1,
          0, 1, -1, 0)


class KY040:
    def __init__(self, clk, dt, sw=None, steps_per_detent=4, use_irq=True):
        # CLK and DT have 10 kOhm pull-ups on the module; the internal pull-up does no harm and
        # keeps the lines defined if the module's + pin is not connected yet.
        self.clk = Pin(clk, Pin.IN, Pin.PULL_UP)
        self.dt = Pin(dt, Pin.IN, Pin.PULL_UP)
        # SW is a bare switch to GND (R1 pad usually empty): the internal pull-up is required.
        self.sw = Pin(sw, Pin.IN, Pin.PULL_UP) if sw is not None else None
        self.spd = steps_per_detent
        self._state = self._read()
        self._raw = 0        # edges counted, +1 per clockwise edge
        self._base = 0       # raw count at the last detent reached
        self._pos = 0        # detents (clicks), clockwise positive
        if use_irq:
            trig = Pin.IRQ_RISING | Pin.IRQ_FALLING
            self.clk.irq(handler=self._edge, trigger=trig)
            self.dt.irq(handler=self._edge, trigger=trig)

    def _read(self):
        return (self.clk.value() << 1) | self.dt.value()

    def _edge(self, _pin=None):
        new = self._read()
        if new == self._state:
            return
        self._raw += _TABLE[(self._state << 2) | new]
        self._state = new
        # Latch whole clicks only at a rest (detent) state.
        if new == 3 or (self.spd == 2 and new == 0) or self.spd == 1:
            d = self._raw - self._base
            n = (d + self.spd // 2) // self.spd if d >= 0 else -((-d + self.spd // 2) // self.spd)
            if n:
                self._pos += n
                self._base += n * self.spd

    def update(self):
        """Poll the pins (call often) when not using interrupts."""
        self._edge()

    def position(self):
        """Clicks turned since start (or reset): clockwise positive."""
        return self._pos

    def reset(self, value=0):
        self._pos = value
        self._base = self._raw

    def pressed(self):
        """True while the knob is pushed in (SW pulled to GND)."""
        return self.sw is not None and self.sw.value() == 0
