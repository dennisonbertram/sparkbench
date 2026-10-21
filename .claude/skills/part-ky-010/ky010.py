# KY-010 photo interrupter (light barrier) module, MicroPython driver.
# The module carries an Everlight ITR9608 slotted opto-interrupter: an IR LED (with its series
# resistor on the board) shining across the slot onto an NPN phototransistor. The transistor's
# collector is the S pin, pulled up to + on the board. With the slot clear the transistor
# conducts and pulls S LOW; when something blocks the slot it turns off and S goes HIGH.
# Power the module from 3.3 V on a 3.3 V board: S is pulled up to the supply.
# ITR9608 rise/fall time is about 15 us, so slots/teeth can be counted with an interrupt.
from machine import Pin


class KY010:
    def __init__(self, s, pull=None):
        """s: GPIO number (or Pin) wired to S. The board already has a pull-up on S; pass
        pull=Pin.PULL_UP only for a clone that lacks it."""
        if isinstance(s, int):
            self.pin = Pin(s, Pin.IN, pull) if pull is not None else Pin(s, Pin.IN)
        else:
            self.pin = s
        self.count = 0

    def blocked(self):
        """True while something is in the slot (S HIGH)."""
        return self.pin.value() == 1

    def raw(self):
        """Logic level on S: 1 = beam blocked, 0 = beam clear."""
        return self.pin.value()

    def start_counting(self):
        """Count every time the beam gets blocked (rising edge on S), e.g. slots of an encoder disc."""
        self.count = 0

        def _edge(pin):
            self.count += 1

        self.pin.irq(trigger=Pin.IRQ_RISING, handler=_edge)

    def stop_counting(self):
        self.pin.irq(handler=None)
