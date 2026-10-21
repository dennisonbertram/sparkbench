# HC-SR505 mini PIR motion sensor module, MicroPython driver.
# The module has the PIR element, its detector IC and a 3.3 V regulator on board.
# OUT is a push-pull logic output from the 3.3 V rail:
#   HIGH (about 3.3 V) while motion is detected; it stays high for the hold time
#   (default 8 s +/- 30 %) and re-triggers while motion continues (repeatable trigger).
#   LOW (0 V) otherwise.
# Because OUT comes from the on-board 3.3 V regulator it connects straight to a
# 3.3 V GPIO even when the module is powered from 5 V. No pull-up/down is needed.
# Supply 4.5-20 V on "+": it will not work reliably from 3.3 V.
from machine import Pin


class HCSR505:
    def __init__(self, out_pin):
        self.pin = Pin(out_pin, Pin.IN) if isinstance(out_pin, int) else out_pin

    def motion(self):
        """True while the sensor reports motion (OUT high)."""
        return self.pin.value() == 1

    def on_change(self, handler):
        """Call handler(motion: bool) on every edge of OUT. Pass None to stop."""
        if handler is None:
            self.pin.irq(handler=None)
            return
        self.pin.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
                     handler=lambda p: handler(p.value() == 1))
