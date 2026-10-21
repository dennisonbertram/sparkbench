# E18-D80NK(-N) adjustable infrared proximity switch, MicroPython driver.
# The sensor sends modulated IR and demodulates the reflection; its output is an
# NPN open-collector transistor, normally open (manufacturer instruction guide):
#   OUT LOW  (0) -> an object is within the range set by the rear potentiometer (3-80 cm)
#   OUT HIGH (1) -> nothing detected (needs a pull-up resistor on OUT)
# The guide asks for a pull-up on the signal output. Pull it up to the board's
# 3.3 V logic (this driver enables the GPIO's internal pull-up; add an external
# 1-10 kOhm resistor to 3V3 for long leads), never to the sensor's 5 V supply on a
# 3.3 V board. Power the sensor itself from 5 V.
from machine import Pin


class E18D80NK:
    def __init__(self, pin, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin

    def raw(self):
        """Logic level on OUT: 0 = object detected, 1 = clear."""
        return self.pin.value()

    def detected(self):
        """True while an object is within the set range (NPN output pulls OUT low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when an object appears (falling edge) or, with
        on_detect=False, when it goes away (rising edge)."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
