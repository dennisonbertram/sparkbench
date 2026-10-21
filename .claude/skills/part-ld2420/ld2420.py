# HLK-LD2420 24 GHz human presence radar, OT2 pin, MicroPython driver.
# Hi-Link HLK-LD2420 User Manual V1.1, Table 3-2 (J2 header, 2.54 mm):
#   J2 pin 5 OT2 "IO for reporting detection status: high for occupied, low for unoccupied", 0-3.3 V.
# OT2 is a 3.3 V logic output, so it connects straight to an ESP32 / Pico GPIO (no pull-up, no level shifter).
# After the person leaves, OT2 stays high for the "target disappearance delay time" set with
# Hi-Link's HLK-LD2420_TOOL; any detection during that time restarts it. Moving and micro-moving
# (sitting, breathing) people both count as occupied.
# Range, thresholds and that delay are configured over the UART (OT1 = TX, RX; 115200 baud), not this pin.
from machine import Pin


class LD2420:
    def __init__(self, pin):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN)
        self.pin = pin

    def value(self):
        """Raw level on OT2: 1 = occupied, 0 = unoccupied."""
        return self.pin.value()

    def present(self):
        """True while the radar reports the area as occupied."""
        return self.pin.value() == 1

    def irq(self, handler, on_arrive=True):
        """Call handler(pin) when the area becomes occupied (rising edge) or, with on_arrive=False,
        when it has been empty for the disappearance delay (falling edge)."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if on_arrive else Pin.IRQ_FALLING)
