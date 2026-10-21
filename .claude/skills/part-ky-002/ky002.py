# KY-002 vibration switch module (Keyes / Joy-IT SEN-KY002), MicroPython driver.
# The module is a spring-in-tube vibration switch between S and GND with a 10 kOhm
# pull-up from S to the middle (+) pin. At rest S reads 1; a shake or knock makes the
# spring touch the tube for a few milliseconds and S pulses low (falling edge).
# The contact bounces, so shakes are debounced in software.
from machine import Pin
import time


class KY002:
    def __init__(self, pin, debounce_ms=100):
        # The board already has a 10 k pull-up; the internal pull-up does no harm and keeps
        # S defined if the + pin is left unconnected by mistake.
        self.pin = Pin(pin, Pin.IN, Pin.PULL_UP) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms
        self.count = 0
        self._last = time.ticks_add(time.ticks_ms(), -debounce_ms)
        self.pin.irq(handler=self._edge, trigger=Pin.IRQ_FALLING)

    def _edge(self, pin):
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last) >= self.debounce_ms:
            self._last = now
            self.count += 1

    def value(self):
        """Raw level on S: 1 at rest, 0 while the spring touches the tube."""
        return self.pin.value()

    def vibrating(self):
        """True while the spring contact is closed (S low)."""
        return self.pin.value() == 0

    def shakes(self):
        """Debounced number of shakes (falling edges on S) since the last call."""
        n = self.count
        self.count = 0
        return n
