# KY-017 tilt switch module, MicroPython driver.
# The module is a two-terminal tilt switch (mercury capsule on the Keyes board, a
# sealed ball capsule on newer Joy-IT boards) between S and GND (-), plus an
# indicator LED in series with a 680 Ohm resistor from the + pin to S.
#   switch open   -> no LED current, S floats up towards + through the LED -> reads 1
#   switch closed -> S shorted to GND, LED lights                          -> reads 0
# The LED path is only a very weak pull-up (S sits one LED drop below + when
# almost no current flows), so the GPIO's internal pull-up is enabled to give a
# clean logic 1. Power + from 3.3 V on a 3.3 V board.
# Which orientation closes the switch depends on how the board is mounted.
# The contacts bounce for a few milliseconds at each change, so readings are debounced.
from machine import Pin
import time


class KY017:
    def __init__(self, pin, debounce_ms=50):
        self.pin = Pin(pin, Pin.IN, Pin.PULL_UP) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on S right now: 0 = switch closed (LED on), 1 = open."""
        return self.pin.value()

    def closed(self):
        """True while the switch contacts are closed (S pulled LOW)."""
        return self.pin.value() == 0

    def tilted(self):
        """Debounced: True if S stays LOW (switch closed) for debounce_ms."""
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
        """Call handler(pin) when the switch closes (falling edge) or opens (rising edge).
        Expect several calls per change because the contacts bounce."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_close else Pin.IRQ_RISING)
