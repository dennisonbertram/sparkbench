# AM312 mini PIR motion sensor module, MicroPython driver.
# The Nanyang Senba AM312 is a digital PIR detector with its signal processing built in.
# Its REL output is a push-pull logic output (VOH > VDD - 1 V, VOL < 1 V at 10 mA):
#   HIGH (about 3 V) for ~2.3 s after motion is detected, re-triggering while motion continues
#   LOW  (0 V) otherwise; after going low it ignores motion for a ~2.3 s blockade time.
# The common mini module has a 3 V LDO, so OUT is about 3 V even when VCC is 5-12 V and
# connects straight to a 3.3 V GPIO. No pull-up/down is needed.
# Allow about a minute after power-up for the sensor to settle (datasheet steadying time).
from machine import Pin


class AM312:
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
