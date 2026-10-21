# HC-SR602 (MH-SR602 / HW-438) mini PIR motion sensor module, MicroPython driver.
# The module carries a digital PIR detector and a 3.3 V LDO, so OUT is a logic output
# from the 3.3 V rail even when "+" is fed 5-15 V:
#   HIGH (about 3.3 V) for about 2.5 s after motion (factory delay; set by a chip resistor),
#   re-triggering while motion continues.
#   LOW (0 V) otherwise; after going low it ignores motion for about 2 s (blocking time).
# OUT connects straight to a 3.3 V GPIO. No pull-up/down is needed.
# Supply 3.3-15 V DC on "+"; quiescent current about 20 uA.
from machine import Pin


class HCSR602:
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
