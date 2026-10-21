# XKC-Y25-NPN non-contact (capacitive) liquid level sensor, MicroPython driver.
# Manufacturer manual XKC-Y25-NPN V1.6 (Shenzhen XingKeChuang), section 9:
#   black wire (MODE/COM) left unconnected -> normally open output:
#       liquid sensed    -> NPN transistor ON  -> OUT (yellow) pulled LOW
#       no liquid        -> transistor OFF     -> OUT open (high via pull-up)
#   black wire tied to GND -> normally closed output (the logic is inverted).
# OUT is an open collector: it needs a pull-up. On a 3.3 V board pull it up to
# 3V3 (this driver turns on the GPIO's internal pull-up; an external 10 kOhm to
# 3V3 is better on the 50 cm lead), never to the sensor's 5-12 V supply.
# The sensor's response time is about 500 ms, so poll no faster than that is useful.
from machine import Pin


class XKCY25:
    def __init__(self, pin, pull_up=True, normally_closed=False):
        """pin: GPIO number or Pin wired to OUT (yellow).
        normally_closed: True if the black wire is tied to GND."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.nc = normally_closed

    def raw(self):
        """Logic level on OUT (0 = transistor on, 1 = off)."""
        return self.pin.value()

    def liquid(self):
        """True while liquid is sensed at the probe's level."""
        on = self.pin.value() == 0  # NPN transistor conducting
        return (not on) if self.nc else on

    def irq(self, handler, on_liquid=True):
        """Call handler(pin) when liquid arrives (on_liquid=True) or leaves."""
        falling = on_liquid != self.nc
        trig = Pin.IRQ_FALLING if falling else Pin.IRQ_RISING
        return self.pin.irq(handler=handler, trigger=trig)
