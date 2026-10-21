# KY-021 mini magnetic reed switch module, MicroPython driver.
# The module is a normally-open glass reed switch between S and GND (-) plus a
# 10 kOhm pull-up resistor (marked 103) from S to the middle + pin. So S is:
#   HIGH (1) with no magnet nearby (reeds apart, switch open)
#   LOW  (0) while a magnet pulls the reeds together (switch closed) -> "magnet"
# The reeds bounce for a few milliseconds when they make or break, so readings
# are debounced. Power + from 3.3 V on a 3.3 V board: the pull-up takes S up to
# the + supply.
from machine import Pin
import time


class KY021:
    def __init__(self, pin, debounce_ms=20):
        # The board has its own 10k pull-up; an internal pull-up is harmless and
        # keeps the input defined if + is left unconnected.
        self.pin = Pin(pin, Pin.IN, Pin.PULL_UP) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on S right now: 0 = reed closed (magnet), 1 = open."""
        return self.pin.value()

    def closed(self):
        """True while the reed contacts are closed (S pulled LOW)."""
        return self.pin.value() == 0

    def magnet(self):
        """Debounced: True if S stays LOW (magnet present) for debounce_ms."""
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
        """Call handler(pin) when the reed closes (falling edge, magnet arrives) or
        opens (rising edge, magnet leaves). Expect extra calls from contact bounce."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_close else Pin.IRQ_RISING)
