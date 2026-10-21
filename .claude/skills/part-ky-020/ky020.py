# KY-020 ball tilt switch module, MicroPython driver.
# The module is a two-terminal metal-ball tilt switch between S and GND (-) plus a
# 10 kOhm pull-up resistor (marked 103) from S to the middle + pin. So S is:
#   HIGH (1) while the ball is away from the contacts (switch open)
#   LOW  (0) while the ball bridges the contacts (switch closed) -> "tilted"
# Which way counts as "tilted" depends on how the board is mounted: on the common
# Keyes/Joy-IT board the switch closes when the header end is raised.
# The ball bounces for a few milliseconds at each change, so readings are debounced.
# Power + from 3.3 V on a 3.3 V board: the pull-up takes S up to the + supply.
from machine import Pin
import time


class KY020:
    def __init__(self, pin, debounce_ms=50):
        # The board has its own 10k pull-up; an internal pull-up is harmless and
        # keeps the input defined if + is left unconnected.
        self.pin = Pin(pin, Pin.IN, Pin.PULL_UP) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on S right now: 0 = contacts closed, 1 = open."""
        return self.pin.value()

    def closed(self):
        """True while the ball bridges the contacts (S pulled LOW)."""
        return self.pin.value() == 0

    def tilted(self):
        """Debounced: True if S stays LOW (contacts closed) for debounce_ms."""
        state = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            v = self.pin.value()
            if v != state:
                state = v
                t0 = time.ticks_ms()
            time.sleep_ms(2)
        return state == 0

    def irq(self, handler, on_close=True):
        """Call handler(pin) when the contacts close (falling edge) or open (rising edge).
        Expect several calls per change because the ball bounces."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_close else Pin.IRQ_RISING)
