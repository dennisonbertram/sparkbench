# H206 / LM393 slotted (photo-interrupter) speed sensor module, MicroPython driver.
# A WYC-H206 slotted optocoupler (IR LED facing an NPN phototransistor across a ~6 mm slot)
# feeds an LM393 comparator. The LM393 output is open-collector with a 10 kOhm pull-up to VCC
# on the board, so OUT is:
#   HIGH (1) while something blocks the slot (an encoder-wheel spoke)
#   LOW  (0) while the slot is clear (the OUT LED lights)
# Power the module from 3.3 V on a 3.3 V board: OUT is pulled up to VCC.
from machine import Pin
import time


class H206:
    def __init__(self, pin, slots=20, min_us=0):
        """pin: GPIO number (or Pin) wired to OUT. slots: holes in the encoder
        wheel (20 on the usual robot-car disc). min_us: ignore edges closer
        together than this (the LM393 has no hysteresis on this board and can
        chatter on a slow edge; try 200-500 us if counts look too high)."""
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.slots = slots
        self.min_us = min_us
        self._count = 0
        self._last = time.ticks_us()
        self.pin.irq(handler=self._edge, trigger=Pin.IRQ_RISING)

    def _edge(self, pin):
        now = time.ticks_us()
        if self.min_us and time.ticks_diff(now, self._last) < self.min_us:
            return
        self._last = now
        self._count += 1

    def blocked(self):
        """True while something is in the slot (OUT high)."""
        return self.pin.value() == 1

    def count(self):
        """Blocked-edges counted since start or the last reset()."""
        return self._count

    def reset(self):
        self._count = 0

    def rpm(self, window_ms=1000):
        """Count pulses for window_ms and return wheel revolutions per minute."""
        start = self._count
        time.sleep_ms(window_ms)
        pulses = self._count - start
        return pulses * 60000 / (self.slots * window_ms)
