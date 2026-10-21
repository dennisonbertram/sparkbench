# 10-segment LED bar graph (Kingbright DC10EWA, DIP-20) with a bussed resistor network.
# Each segment is a plain LED: anode n (DIP pin n) is driven by a GPIO, its cathode (DIP pin 21-n)
# goes through one resistor of the network to the common pin, which is wired to GND.
# GPIO high = segment on. No chip, no protocol: this helper only switches pins.
from machine import Pin


class BarGraph:
    def __init__(self, pins):
        """pins: GPIO numbers for A1..A10, bottom segment first."""
        self.leds = [Pin(p, Pin.OUT, value=0) for p in pins]

    def __len__(self):
        return len(self.leds)

    def off(self):
        for led in self.leds:
            led.value(0)

    def level(self, n):
        """Light segments 1..n (bar mode); n is clamped to 0..10."""
        n = max(0, min(len(self.leds), int(n)))
        for i, led in enumerate(self.leds):
            led.value(1 if i < n else 0)
        return n

    def dot(self, n):
        """Light only segment n (1..10); 0 = all off."""
        for i, led in enumerate(self.leds):
            led.value(1 if i == n - 1 else 0)

    def show_value(self, value, full_scale):
        """Bar proportional to value / full_scale, rounded to the nearest segment."""
        if full_scale <= 0:
            return self.level(0)
        return self.level(round(len(self.leds) * value / full_scale))

    def bits(self, mask):
        """Set segments from a 10-bit mask (bit 0 = segment 1)."""
        for i, led in enumerate(self.leds):
            led.value((mask >> i) & 1)
