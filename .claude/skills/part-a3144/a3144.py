# A3144 unipolar Hall-effect switch on the KY-003 module, MicroPython driver.
# Datasheet (Allegro A3141-A3144): the output is an OPEN-COLLECTOR NPN that sinks up to 25 mA.
#   B > BOP (south pole facing the branded side, A3144: 70-350 G at 25 C) -> output ON  = pulled LOW.
#   B < BRP (field removed, 50-330 G)                                      -> output OFF = floats.
# Hysteresis about 55 G, so the output does not chatter. The north pole does not switch it (unipolar).
# The output needs a pull-up. Use the GPIO's internal pull-up to 3.3 V: never pull S up to the
# module's 5 V supply when S goes to an ESP32 / Pico pin (they are not 5 V tolerant).
from machine import Pin


class A3144:
    def __init__(self, pin, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin

    def value(self):
        """Raw level on S: 0 = magnet detected (output transistor on), 1 = no magnet."""
        return self.pin.value()

    def detected(self):
        """True while a strong enough south pole is at the sensor (output is active low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when a magnet arrives (falling edge) or, with on_detect=False, leaves."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING)
