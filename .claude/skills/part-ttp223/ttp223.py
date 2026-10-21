# TTP223 one-key capacitive touch module (Tontek TTP223-BA6), MicroPython driver.
# The module's I/O pin is the chip's Q output: a push-pull CMOS output (no pull-up needed).
# Default module (pads A and B open): direct mode, active high - I/O is high only while touched.
#   Pad A bridged -> AHLB=1: active low.   Pad B bridged -> TOG=1: toggle (latching) mode.
# Datasheet timing: about 0.5 s settling after power-on (do not touch the pad then);
# the BA6 package runs in low-power mode, so the first touch takes up to ~220 ms to register.
from machine import Pin


class TTP223:
    def __init__(self, pin, active_high=True):
        # Q is driven both ways by the chip, so no pull resistor is required.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.active_high = active_high  # False if pad A (AHLB) is bridged

    def value(self):
        """Raw level on the I/O pin (0 or 1)."""
        return self.pin.value()

    def touched(self):
        """True while the pad is touched (direct mode), or while latched on (toggle mode)."""
        return self.pin.value() == (1 if self.active_high else 0)

    def irq(self, handler, on_touch=True):
        """Call handler(pin) on the edge where a touch starts (on_touch) or ends."""
        rising = self.active_high == on_touch
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if rising else Pin.IRQ_FALLING)
