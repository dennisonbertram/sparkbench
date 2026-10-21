# 4-channel TCRT5000 IR line tracking module, MicroPython driver.
# Board: red control board with an LM339 quad comparator (U1), four trimmers, LEDs D1-D4 (+ D5 power)
# and a 6-pin header VCC, GND, IN1, IN2, IN3, IN4; four TCRT5000 probe boards plug into its other edge.
# Each LM339 output is open collector with a 10 kOhm pull-up (R1-R4) to VCC, and lights its LED when low:
#   strong IR reflection (white / light surface) -> output LOW, LED on
#   weak reflection (black line, or nothing in range) -> output HIGH, LED off
# The outputs swing to VCC, so power the module from 3.3 V on an ESP32 / Pico.
from machine import Pin


class LineTracker4:
    def __init__(self, in1, in2, in3, in4):
        # The board already pulls every output up to VCC (10 kOhm): no internal pull needed.
        self.pins = [p if not isinstance(p, int) else Pin(p, Pin.IN) for p in (in1, in2, in3, in4)]

    def raw(self):
        """Logic levels of IN1..IN4: 0 = reflective (white) surface, 1 = black line / nothing."""
        return tuple(p.value() for p in self.pins)

    def line(self):
        """Tuple of 1 for every probe that is over the black line (output high), 0 over white."""
        return self.raw()

    def white(self):
        """Tuple of 1 for every probe that sees a white / reflective surface (output low)."""
        return tuple(1 - v for v in self.raw())

    def on_line(self, channel):
        """True when probe 1..4 is over the black line."""
        return self.pins[channel - 1].value() == 1

    def position(self):
        """Weighted line position from -1.5 (probe 1) to +1.5 (probe 4), or None if no probe sees the line."""
        v = self.line()
        n = sum(v)
        if n == 0:
            return None
        return sum((i - 1.5) * x for i, x in enumerate(v)) / n

    def irq(self, channel, handler, on_line=True):
        """Call handler(pin) when probe 1..4 moves onto the line (rising edge) or, with on_line=False,
        onto a white surface (falling edge)."""
        trig = Pin.IRQ_RISING if on_line else Pin.IRQ_FALLING
        return self.pins[channel - 1].irq(handler=handler, trigger=trig)
