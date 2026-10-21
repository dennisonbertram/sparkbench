# SW-420 vibration sensor module, MicroPython driver.
# The SW-420 is a normally closed roller vibration switch. On the module it forms a
# divider with a 10 kOhm resistor; an LM393 comparator compares that node with the
# threshold set on the potentiometer. The LM393 output is open-collector with a
# pull-up to VCC on the board, so DO is:
#   LOW  (0) while the module is still (switch closed)
#   HIGH (1) while it vibrates (switch opens for a moment)
# Vibration pulses are short, so this driver also latches rising edges with an IRQ
# and vibrated() reports any shake since the last call.
# Power the module from 3.3 V when using a 3.3 V board: DO swings to VCC.
from machine import Pin


class SW420:
    def __init__(self, pin):
        # The board has its own pull-up on DO; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self._hits = 0
        self.pin.irq(handler=self._edge, trigger=Pin.IRQ_RISING)

    def _edge(self, pin):
        self._hits += 1

    def raw(self):
        """Logic level on DO right now: 1 = vibrating, 0 = still."""
        return self.pin.value()

    def vibrating(self):
        """True while DO is high (the switch is open because of vibration)."""
        return self.pin.value() == 1

    def vibrated(self):
        """True if DO is high now or rose at least once since the last call."""
        hit = self._hits > 0 or self.pin.value() == 1
        self._hits = 0
        return hit

    def count(self, reset=True):
        """Number of rising edges (vibration pulses) since the last reset."""
        n = self._hits
        if reset:
            self._hits = 0
        return n
