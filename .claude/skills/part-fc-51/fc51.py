# FC-51 IR obstacle avoidance sensor module, MicroPython driver.
# The module drives an IR LED and compares the IR photodiode/receiver signal with the
# threshold set on its potentiometer using an LM393 comparator. The LM393 output is
# open-collector with a 10 kOhm pull-up to VCC on the board, so OUT is:
#   LOW  (0) when an obstacle reflects enough IR (about 2-30 cm, set by the pot)
#   HIGH (1) when the path is clear
# Power the module from 3.3 V when using a 3.3 V board: OUT is pulled up to VCC.
from machine import Pin


class FC51:
    def __init__(self, pin):
        # The board already has a pull-up on OUT; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin

    def raw(self):
        """Logic level on OUT: 0 = obstacle, 1 = clear."""
        return self.pin.value()

    def obstacle(self):
        """True while something is in front of the sensor (OUT pulled low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when an obstacle appears (falling edge) or, with
        on_detect=False, when it goes away (rising edge)."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
