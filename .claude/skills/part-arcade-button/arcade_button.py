# 30 mm arcade push button (Sanwa OBSF-30 snap-in button with its SW-68 microswitch), MicroPython driver.
# The microswitch has two .110" (2.8 mm) quick-connect tabs and one normally open contact:
# released = open, pressed = closed. No chip, no supply, not polarised.
# SW-68 ratings (seller spec sheet): 12 V DC 100 mA, contact resistance < 50 mOhm, life 1 million
# presses at 5 V DC 10 mA, -20 to +60 C.
# Wiring: one tab to GND, the other to a GPIO with the internal pull-up on.
#   pressed -> pin reads 0;  released -> pin reads 1.
# Microswitch contacts bounce for a few milliseconds, so readings are debounced.
from machine import Pin
import time


class ArcadeButton:
    def __init__(self, pin, pull_up=True, debounce_ms=10):
        """pin: GPIO number (or Pin) wired to the SIG tab; the other tab goes to GND."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.debounce_ms = debounce_ms
        self._last = 1

    def value(self):
        """Raw level on the GPIO: 0 = pressed, 1 = released."""
        return self.pin.value()

    def _stable(self):
        v = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            n = self.pin.value()
            if n != v:
                v = n
                t0 = time.ticks_ms()
        return v

    def is_pressed(self):
        """True while the button is held down. Debounced."""
        return self._stable() == 0

    def was_pressed(self):
        """True once for each new press (released -> pressed edge); call it often in a loop."""
        v = self._stable()
        edge = self._last == 1 and v == 0
        self._last = v
        return edge

    def irq(self, handler, on_press=True):
        """Call handler(pin) when pressed (or released with on_press=False).
        Contacts bounce: handlers may fire more than once per press."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_press else Pin.IRQ_RISING)
