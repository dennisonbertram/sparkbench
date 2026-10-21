# Seeed Grove - Water Sensor (SKU 101020018), MicroPython driver.
# Circuit (Seeed schematic WaterDetection.sch, board v0.9b): the comb of bare traces is
# two interleaved nets. One is GND, the other is SIG, pulled up to VCC by a 1 MOhm
# resistor (R1). There is no comparator or transistor. So SIG is:
#   HIGH (1) while the traces are dry (only the 1 MOhm pull-up)
#   LOW  (0) when water bridges the traces and shorts SIG towards GND -> "wet"
# The pull-up is very weak, so do NOT enable the GPIO's internal pull-up or pull-down
# (about 50 kOhm): it would swamp the 1 MOhm resistor and wet traces might not read low.
from machine import Pin
import time


class GroveWaterSensor:
    def __init__(self, pin, samples=5, gap_ms=2):
        # Plain input, no internal pull resistor (see above).
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.samples = samples
        self.gap_ms = gap_ms

    def raw(self):
        """Logic level on SIG right now: 0 = water on the traces, 1 = dry."""
        return self.pin.value()

    def wet(self):
        """Majority vote over a few readings (a drop that is just touching can flicker).
        True when water bridges the traces (SIG LOW)."""
        low = 0
        for i in range(self.samples):
            if self.pin.value() == 0:
                low += 1
            if i < self.samples - 1:
                time.sleep_ms(self.gap_ms)
        return low * 2 > self.samples

    def irq(self, handler, on_wet=True):
        """Call handler(pin) when water arrives (falling edge) or dries off (rising edge).
        Expect several calls while a drop settles."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_wet else Pin.IRQ_RISING)
