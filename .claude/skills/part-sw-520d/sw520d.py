# SW-520D tilt sensor module (SW-520D ball tilt switch + LM393 comparator), MicroPython driver.
# The SW-520D is a ball switch: its contacts are closed while the module stands
# upright (ball resting on the two poles) and open once it is tilted past roughly
# 15-45 degrees. On the module the switch pulls the LM393 input low; the LM393
# output is open-collector with a 10 kOhm pull-up to VCC on the board, so DO is:
#   LOW  (0) while upright (switch closed, DO-LED on)
#   HIGH (1) while tilted  (switch open,  DO-LED off)
# The ball bounces when it rolls, so tilted() requires the level to stay the same
# for a short settle time before it reports a change.
# Power the module from 3.3 V when using a 3.3 V board: DO swings to VCC.
from machine import Pin
import time


class SW520D:
    def __init__(self, pin, settle_ms=20):
        # The board has its own pull-up on DO; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.settle_ms = settle_ms
        self._state = self.pin.value()

    def raw(self):
        """Logic level on DO right now: 1 = tilted, 0 = upright."""
        return self.pin.value()

    def tilted(self):
        """Debounced state: True when tilted, False when upright."""
        v = self.pin.value()
        if v != self._state:
            t0 = time.ticks_ms()
            while time.ticks_diff(time.ticks_ms(), t0) < self.settle_ms:
                if self.pin.value() != v:
                    return self._state == 1
            self._state = v
        return self._state == 1

    def upright(self):
        return not self.tilted()
