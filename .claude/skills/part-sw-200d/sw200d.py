# Seeed Studio Grove - Tilt Switch (SW-200D two-ball tilt switch), MicroPython driver.
# Board schematic (Grove - Tilt Switch v1.1): the SW-200D sits between VCC and SIG,
# and a 10 kOhm resistor pulls SIG down to GND. So SIG is:
#   HIGH (1) while the switch is closed: the gold-pin (trigger) end points down by
#            more than ~10 degrees, i.e. the board stands upright as Seeed describes
#   LOW  (0) while the switch is open: tilted toward the silver-pin end by > ~10 deg
# The SW-200D datasheet gives a conduction (bounce) time of about 2 ms, so is_closed()
# waits for the level to stay stable for settle_ms before reporting a change.
# SIG swings to VCC: power the Grove board from 3.3 V on a 3.3 V board.
from machine import Pin
import time


class SW200D:
    def __init__(self, pin, settle_ms=20):
        # The board has its own 10 kOhm pull-down; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.settle_ms = settle_ms
        self._state = self.pin.value()

    def raw(self):
        """Level on SIG right now: 1 = switch closed, 0 = open."""
        return self.pin.value()

    def is_closed(self):
        """Debounced state: True while the switch is closed (gold-pin end down)."""
        v = self.pin.value()
        if v != self._state:
            t0 = time.ticks_ms()
            while time.ticks_diff(time.ticks_ms(), t0) < self.settle_ms:
                if self.pin.value() != v:
                    return self._state == 1
            self._state = v
        return self._state == 1

    def tilted(self):
        """True while tipped away from the closed (upright) position."""
        return not self.is_closed()
