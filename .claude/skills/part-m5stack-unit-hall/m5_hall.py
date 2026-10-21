# M5Stack Unit Hall (U084), MicroPython driver.
# Schematic (M5Stack): three Allegro-type A3144E unipolar Hall switches U1-U3, each with an
# 820 Ohm pull-up to the unit's 3.3 V rail (HT7533 LDO fed from the Grove 5 V). Their outputs
# A, B, C go into a 74HC08D AND gate (also on 3.3 V): OUT = A AND B AND C, push-pull.
#   A3144E: open-collector output turns ON (pulls low) when B > BOP (south pole facing the
#   branded face, 70-350 G at 25 C) and releases when B < BRP (~55 G hysteresis).
#   So OUT (Grove white wire) is LOW while ANY of the three switches sees a magnet,
#   HIGH (about 3.3 V) otherwise. The red LED (1 kOhm from 3.3 V to OUT) lights while OUT is low.
# OUT is driven by the 74HC08 at 3.3 V: safe for 3.3 V GPIOs, no pull-up needed.
from machine import Pin


class M5Hall:
    def __init__(self, out_pin):
        self.pin = Pin(out_pin, Pin.IN) if isinstance(out_pin, int) else out_pin

    def value(self):
        """Raw level on OUT: 0 = magnet detected, 1 = no magnet."""
        return self.pin.value()

    def magnet(self):
        """True while a magnet is detected (OUT is active low)."""
        return self.pin.value() == 0

    def on_change(self, handler):
        """Call handler(magnet: bool) on every edge of OUT. Pass None to stop."""
        if handler is None:
            self.pin.irq(handler=None)
            return
        self.pin.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
                     handler=lambda p: handler(p.value() == 0))
