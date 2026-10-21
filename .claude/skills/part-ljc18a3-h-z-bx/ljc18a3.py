# LJC18A3-H-Z/BX capacitive proximity switch (M18, 1-10 mm, NPN normally open), MicroPython driver.
# Seller/family specs (LJC18A3 series): supply 6-36 V DC (12-24 V nominal), < 13 mA;
# output NPN normally open, open collector, sinks up to 300 mA; response about 100 Hz.
# Leads: brown = V+, blue = 0 V, black = output. Senses metal AND non-metal objects
# (plastic, glass, wood, water, grain) within 1-10 mm; the range is set with the trimpot
# on the back of the barrel.
#   OUT LOW  (0) -> object within the set distance (output transistor on, LED lit)
#   OUT HIGH (1) -> nothing detected (transistor off; the level comes from YOUR pull-up)
# The output only sinks current, so it needs a pull-up. Pull it up to the board's 3.3 V
# (an external 4.7-10 kOhm resistor to 3V3; this driver also enables the GPIO's internal
# pull-up), NEVER to the sensor's 6-36 V supply.
from machine import Pin


class LJC18A3:
    def __init__(self, pin, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin

    def raw(self):
        """Logic level on OUT: 0 = object detected, 1 = clear."""
        return self.pin.value()

    def detected(self):
        """True while an object is within the sensing distance (NPN output pulls OUT low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when an object arrives (falling edge) or, with on_detect=False,
        when it leaves (rising edge). The sensor switches at about 100 Hz at most."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
