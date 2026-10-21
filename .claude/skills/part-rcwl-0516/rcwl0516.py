# RCWL-0516 microwave (Doppler radar) motion sensor module, MicroPython driver.
# The module's RCWL-9196 IC (a BISS0001-style motion processor) drives OUT high (3.3 V,
# from the board's own regulator) while motion is detected and low otherwise. OUT is a
# push-pull logic output, so no pull-up/down is needed. Each detection holds OUT high for
# about 2 s (default, no C-TM fitted) and re-triggers while motion continues.
# The module needs 4-28 V on VIN (use the 5 V / VBUS pin); OUT is still only 3.3 V.
from machine import Pin


class RCWL0516:
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
