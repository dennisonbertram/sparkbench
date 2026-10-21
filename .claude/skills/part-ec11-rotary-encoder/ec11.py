# Alps Alpine EC11E15244B2 rotary encoder (bare EC11, 15 pulses / 30 detents, push switch), MicroPython driver.
# The encoder is three passive contacts: A-C and B-C (the quadrature encoder, C = common) and D-E (push switch).
# Wire C and E to GND, A, B and D to GPIOs with pull-ups to 3.3 V. Contact closed = pin reads 0.
# Datasheet: ratings 10 mA max / 1 mA min at 5 V DC (encoder), so use about 3.3 kOhm pull-ups at 3.3 V
# (the GPIO's internal ~50 kOhm pull-up alone is below the minimum contact current). Switch: 0.5 mA min.
# Output wave (CW): A changes before B. Detent stability points alternate between both contacts
# open (A=1, B=1) and both closed (A=0, B=0), so one click = half a quadrature cycle = 2 edges:
#   (A,B) = 11 -> 01 -> 00 -> 10 -> 11   (CW, two clicks)
# Every edge on either line is decoded with a full state table, so contact bounce (forward then back)
# cancels itself instead of adding counts. Chattering 3 ms / bounce 2 ms max per the datasheet.
from machine import Pin

# Index = (old_state << 2) | new_state, state = (A << 1) | B. +1 = clockwise edge, -1 = CCW,
# 0 = no change or an invalid double change (both lines flipped: direction unknown, ignored).
_TABLE = (0, -1, 1, 0,
          1, 0, 0, -1,
          -1, 0, 0, 1,
          0, 1, -1, 0)


class EC11:
    def __init__(self, a, b, sw=None, steps_per_detent=2, use_irq=True):
        # External pull-ups (3.3 kOhm) are recommended; the internal pull-up does no harm.
        self.a = Pin(a, Pin.IN, Pin.PULL_UP)
        self.b = Pin(b, Pin.IN, Pin.PULL_UP)
        self.sw = Pin(sw, Pin.IN, Pin.PULL_UP) if sw is not None else None
        self.spd = steps_per_detent   # 2 for EC11E15244B2 (30 detents, 15 pulses); 4 for 1-pulse-per-click types
        self._state = self._read()
        self._raw = 0        # edges counted, +1 per clockwise edge
        self._base = 0       # raw count at the last detent reached
        self._pos = 0        # detents (clicks), clockwise positive
        if use_irq:
            trig = Pin.IRQ_RISING | Pin.IRQ_FALLING
            self.a.irq(handler=self._edge, trigger=trig)
            self.b.irq(handler=self._edge, trigger=trig)

    def _read(self):
        return (self.a.value() << 1) | self.b.value()

    def _edge(self, _pin=None):
        new = self._read()
        if new == self._state:
            return
        self._raw += _TABLE[(self._state << 2) | new]
        self._state = new
        # Latch whole clicks only at a detent stability point: 11 always; 00 too on 2-edge-per-click types.
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
        """True while the knob is pushed in (switch D-E closed, D pulled to GND)."""
        return self.sw is not None and self.sw.value() == 0
