# Adafruit IR break beam sensor (3 mm LEDs, product 2167), MicroPython driver.
# The emitter (2 wires: red = power, black = ground) just needs 3.3-5.5 V.
# The receiver (3 wires: red = power, black = ground, white/yellow = signal) has an
# open-collector output: its transistor pulls the signal to ground while the beam is
# broken and lets it float while the beam is intact. A pull-up is therefore required:
# the internal pull-up is enabled here, and a 10 kOhm resistor from the signal wire to the receiver's red wire
# also works (Adafruit guide).
#   signal LOW  (0) -> beam broken (something between emitter and receiver)
#   signal HIGH (1) -> beam intact (receiver sees the emitter)
# Response time < 2 ms.
from machine import Pin


class BreakBeam:
    def __init__(self, pin):
        self.pin = Pin(pin, Pin.IN, Pin.PULL_UP) if isinstance(pin, int) else pin

    def raw(self):
        """Logic level on the signal wire: 0 = broken, 1 = intact."""
        return self.pin.value()

    def broken(self):
        """True while something blocks the beam."""
        return self.pin.value() == 0

    def irq(self, handler, on_break=True):
        """Call handler(pin) when the beam is broken (falling edge) or, with
        on_break=False, when it is restored (rising edge)."""
        trig = Pin.IRQ_FALLING if on_break else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
