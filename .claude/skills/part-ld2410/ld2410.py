# HLK-LD2410C 24 GHz human presence radar, OUT pin, MicroPython driver.
# Hi-Link LD2410C manual / serial protocol v1.00, pin 3 OUT "target state output":
#   human presence detected -> HIGH (3.3 V IO level), no human presence -> LOW.
# OUT is a push-pull 3.3 V output, so it connects straight to an ESP32 / Pico GPIO (no pull-up).
# After the person leaves, OUT stays high for the "no-one duration" (factory default 5 s) before
# going low; moving and still (sitting, lying) people both count as presence.
# Changing range, sensitivity or that delay is done over the UART (256000 baud, 8N1), not this pin.
from machine import Pin


class LD2410:
    def __init__(self, pin):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN)
        self.pin = pin

    def value(self):
        """Raw level on OUT: 1 = someone present, 0 = nobody."""
        return self.pin.value()

    def present(self):
        """True while the radar reports a human (moving or still) in range."""
        return self.pin.value() == 1

    def irq(self, handler, on_arrive=True):
        """Call handler(pin) when someone is first detected (rising edge) or, with on_arrive=False,
        when the area has been empty for the no-one duration (falling edge)."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if on_arrive else Pin.IRQ_FALLING)
