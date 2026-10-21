# LJ12A3-4-Z/BX inductive proximity switch (M12, 4 mm, NPN normally open), MicroPython driver.
# Datasheet (Electrokit LJ12A3-4): supply 6-36 V DC, output NPN normally open, 3-wire,
# 300 mA sink; brown = V+, black = load (output), blue = GND. Detects iron/steel within 0-4 mm.
#   OUT LOW  (0) -> metal within the sensing distance (output transistor on, LED lit)
#   OUT HIGH (1) -> no metal (transistor off; the level comes from YOUR pull-up)
# The output is an open collector that only sinks current, so it needs a pull-up. Pull it up
# to the board's 3.3 V (an external 4.7-10 kOhm resistor to 3V3; this driver also enables the
# GPIO's internal pull-up), NEVER to the sensor's 6-36 V supply.
from machine import Pin


class LJ12A3:
    def __init__(self, pin, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin

    def raw(self):
        """Logic level on OUT: 0 = metal detected, 1 = clear."""
        return self.pin.value()

    def detected(self):
        """True while metal is within the sensing distance (NPN output pulls OUT low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when metal arrives (falling edge) or, with on_detect=False,
        when it leaves (rising edge). Useful for counting gear teeth or homing an axis."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
