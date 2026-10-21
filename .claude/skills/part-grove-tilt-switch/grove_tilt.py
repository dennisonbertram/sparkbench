# Seeed Grove - Tilt Switch (SKU 101020025), MicroPython driver.
# The board (Seeed schematic "Grove - Tilt Switch v1.1") is just an SW-200D
# two-ball tilt switch from VCC to SIG plus a 10 kOhm pull-down (R1) from SIG
# to GND. No comparator, no LED driver:
#   switch closed (module upright, gold pins down)  -> SIG = VCC  -> 1
#   switch open   (module tilted past ~10 deg / over) -> SIG = 0 V -> 0
# So SIG swings to the module's VCC: power it from 3V3 on a 3.3 V board.
# The balls bounce for about 2 ms when they roll (SW-200D "conductive time"),
# so tilted() waits for the level to stay stable before reporting a change.
from machine import Pin
import time


class GroveTilt:
    def __init__(self, pin, settle_ms=20):
        # The board has its own 10 k pull-down on SIG; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.settle_ms = settle_ms
        self._state = self.pin.value()

    def raw(self):
        """Logic level on SIG right now: 1 = upright (switch closed), 0 = tilted."""
        return self.pin.value()

    def upright(self):
        """Debounced state: True while upright (switch closed, SIG high)."""
        v = self.pin.value()
        if v != self._state:
            t0 = time.ticks_ms()
            while time.ticks_diff(time.ticks_ms(), t0) < self.settle_ms:
                if self.pin.value() != v:
                    return self._state == 1
            self._state = v
        return self._state == 1

    def tilted(self):
        """Debounced state: True when tilted (switch open, SIG low)."""
        return not self.upright()
