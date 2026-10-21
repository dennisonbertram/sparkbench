# MC-38 magnetic door/window switch (a reed switch in a plastic case, plus a separate magnet), MicroPython driver.
# Datasheet (MC-38): N.C. contact in alarm terms = the contacts are CLOSED while the magnet is next to the switch
# (door shut) and OPEN when the magnet moves away (door open). Operating gap 15-25 mm; contact rating
# 100 mA, 200 V DC, 3 W max. Two wires, not polarised: no supply, no chip.
# Wiring: one wire to GND, the other to a GPIO with the internal pull-up on.
#   magnet near (closed) -> pin reads 0;  magnet away (open) -> pin reads 1.
# Reed contacts bounce for about a millisecond when they change, so readings are debounced.
from machine import Pin
import time


class MC38:
    def __init__(self, pin, pull_up=True, debounce_ms=20):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.debounce_ms = debounce_ms

    def value(self):
        """Raw level on the signal wire: 0 = contacts closed (magnet near), 1 = open (magnet away)."""
        return self.pin.value()

    def is_closed(self):
        """True while the magnet is next to the switch (door/window shut). Debounced."""
        v = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            if self.pin.value() != v:
                v = self.pin.value()
                t0 = time.ticks_ms()
        return v == 0

    def is_open(self):
        """True while the magnet is away from the switch (door/window open)."""
        return not self.is_closed()

    def irq(self, handler, on_open=True):
        """Call handler(pin) when the door opens (rising edge) or, with on_open=False, when it closes.
        Contacts bounce: handlers may fire more than once per movement."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if on_open else Pin.IRQ_FALLING)
