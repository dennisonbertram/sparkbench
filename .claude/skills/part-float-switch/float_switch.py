# Vertical float switch (ZP4510-type PP float on an M10 stem), MicroPython driver.
# Inside the stem is a glass reed switch; a ring magnet in the float closes it when the float
# slides to the switching point. It is just two wires, not polarised, no supply and no chip.
# Ratings (seller specs): 10 W max, 100 V DC max switching voltage, 0.5 A max switching current,
# 100 mOhm max contact resistance.
# Contact sense depends on which way round the float sits on the stem (remove the clip and flip
# the float 180 degrees to reverse it, as in float-switch manufacturer datasheets). Most hobby units
# are fitted "normally open": contacts OPEN when dry (float down), CLOSED when water lifts the float.
# Check yours once with a multimeter; pass closed_when_high=False if yours is the other way round.
# Wiring: one wire to GND, the other to a GPIO with the internal pull-up on.
#   contacts closed -> pin reads 0;  contacts open -> pin reads 1.
# The float bobs on ripples and the reed bounces, so readings are debounced.
from machine import Pin
import time


class FloatSwitch:
    def __init__(self, pin, pull_up=True, closed_when_high=True, debounce_ms=50):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.closed_when_high = closed_when_high
        self.debounce_ms = debounce_ms

    def value(self):
        """Raw level on the signal wire: 0 = contacts closed, 1 = contacts open."""
        return self.pin.value()

    def is_closed(self):
        """True while the reed contacts are closed. Waits until the level is stable for debounce_ms."""
        v = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            n = self.pin.value()
            if n != v:
                v = n
                t0 = time.ticks_ms()
        return v == 0

    def is_high(self):
        """True when the liquid has lifted the float (water at or above the switch point)."""
        return self.is_closed() == self.closed_when_high

    def is_low(self):
        return not self.is_high()

    def irq(self, handler, trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING):
        """Call handler(pin) on a change of the contacts. The float bounces: expect several calls."""
        self.pin.irq(handler=handler, trigger=trigger)
