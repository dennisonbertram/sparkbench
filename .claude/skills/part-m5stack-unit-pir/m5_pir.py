# M5Stack Unit PIR (U004), MicroPython driver.
# The unit carries a Nanyang Senba AS312 digital PIR detector (amplifier, filter and
# decision logic inside the can) powered from an HT7533 3.3 V LDO fed by the Grove 5 V.
# The AS312 REL output is push-pull from its 3.3 V rail (VOH > VDD - 1 V, VOL < 1 V at
# 10 mA) and reaches the Grove OUT pin (white wire) through a 1 kOhm series resistor:
#   HIGH (about 3.3 V) for ~2.3 s (TOH) after motion, re-triggering while motion continues
#   LOW  (0 V) otherwise; after falling it ignores motion for ~2.3 s (lock time TOL).
# Safe for 3.3 V GPIOs even though the unit is powered from 5 V. No pull-up/down needed.
# Allow up to a minute after power-up for the detector to settle.
from machine import Pin


class M5PIR:
    def __init__(self, out_pin):
        self.pin = Pin(out_pin, Pin.IN) if isinstance(out_pin, int) else out_pin

    def motion(self):
        """True while the unit reports motion (OUT high)."""
        return self.pin.value() == 1

    def on_change(self, handler):
        """Call handler(motion: bool) on every edge of OUT. Pass None to stop."""
        if handler is None:
            self.pin.irq(handler=None)
            return
        self.pin.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
                     handler=lambda p: handler(p.value() == 1))
