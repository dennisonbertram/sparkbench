# KW11-3Z micro limit switch (SPDT snap-action switch, Omron SS-5GL form factor), MicroPython driver.
# Three terminals: COM, NO, NC. Lever released: COM-NC closed, COM-NO open.
# Lever pressed (past the operating position): COM-NO closed, COM-NC open. No supply, no chip.
# Wiring used here: COM to GND, NO to a GPIO with the internal pull-up on.
#   pressed -> pin reads 0;  released -> pin reads 1.
# (Fail-safe alternative: COM to GND, NC to the GPIO; then pressed reads 1 and a broken wire also reads 1.)
# Snap-action contacts bounce for a few milliseconds when they change, so readings are debounced.
from machine import Pin
import time


class LimitSwitch:
    def __init__(self, pin, normally_closed=False, pull_up=True, debounce_ms=10):
        """pin: GPIO number (or Pin) wired to NO, or to NC with normally_closed=True. COM goes to GND."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.nc = normally_closed
        self.debounce_ms = debounce_ms

    def value(self):
        """Raw level on the GPIO."""
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
        """True while the lever is pressed (switch actuated). Debounced."""
        v = self._stable()
        # NO wiring: pressed closes COM-NO and pulls the pin to GND (0).
        # NC wiring: pressed opens COM-NC and the pull-up takes the pin high (1).
        return v == 1 if self.nc else v == 0

    def irq(self, handler, on_press=True):
        """Call handler(pin) when the lever is pressed (or released with on_press=False).
        Contacts bounce: handlers may fire more than once per movement."""
        falling = on_press != self.nc
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if falling else Pin.IRQ_RISING)
