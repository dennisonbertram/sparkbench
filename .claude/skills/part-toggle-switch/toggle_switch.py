# MTS-102 miniature toggle switch (SPDT, ON-ON, 3 solder lugs), MicroPython driver.
# Three terminals in a row: L1, COM (the middle lug, the moving contact), L2.
# The lever always rests in one of two positions: COM-L1 closed, or COM-L2 closed
# (break-before-make: for a moment while the lever travels, neither is closed).
# No supply, no chip. On most toggle switches the lever points AWAY from the terminal it
# connects (the contact rocks the other way), so check yours once with a multimeter.
# Wiring used here: COM to GND, L1 and L2 each to a GPIO with the internal pull-up on.
#   closed contact -> that pin reads 0;  open contact -> that pin reads 1.
# (One-GPIO wiring also works: COM to GND, L1 to a pulled-up GPIO, L2 unconnected.)
# Contacts bounce for a few milliseconds when switched, so readings are debounced.
from machine import Pin
import time


class ToggleSwitch:
    def __init__(self, l1, l2=None, pull_up=True, debounce_ms=20):
        """l1: GPIO number (or Pin) wired to L1. l2: GPIO wired to L2, or None. COM goes to GND."""
        pull = Pin.PULL_UP if pull_up else None
        self.l1 = Pin(l1, Pin.IN, pull) if isinstance(l1, int) else l1
        if l2 is None:
            self.l2 = None
        else:
            self.l2 = Pin(l2, Pin.IN, pull) if isinstance(l2, int) else l2
        self.debounce_ms = debounce_ms

    def _raw(self):
        return (self.l1.value(), self.l2.value() if self.l2 else 1)

    def _stable(self):
        v = self._raw()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            n = self._raw()
            if n != v:
                v = n
                t0 = time.ticks_ms()
        return v

    def position(self):
        """'L1' while COM-L1 is closed, 'L2' while COM-L2 is closed, None if neither
        (lever mid-travel, or L2 not wired and COM-L1 open). Debounced."""
        a, b = self._stable()
        if a == 0 and b == 0:
            raise OSError('L1 and L2 both read closed: check the wiring (is COM on the middle lug?)')
        if a == 0:
            return 'L1'
        if b == 0:
            return 'L2'
        return None

    def is_on(self):
        """True while COM-L1 is closed (single-GPIO use)."""
        return self.position() == 'L1'
