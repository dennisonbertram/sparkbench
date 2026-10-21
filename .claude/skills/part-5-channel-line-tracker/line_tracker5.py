# 5-channel TCRT5000 IR line tracking sensor board (blue 95 x 20 mm board, header GND, 5V, OUT1-OUT5,
# one 74HC14D hex Schmitt-trigger inverter, no trimmers), MicroPython driver.
# Board circuit: each TCRT5000's IR LED is lit all the time. Its phototransistor collector is pulled
# up to VCC; that node drives one 74HC14 Schmitt inverter input, and the inverter output is OUTn
# (push-pull, swings 0 V to VCC).
#   Black line (IR absorbed): transistor off, input high -> OUTn = LOW, channel LED off.
#   White / light surface (IR reflected): transistor conducts, input low -> OUTn = HIGH, LED on.
#   Nothing within range (lifted off the floor): reads like black, OUTn = LOW.
# Power the board from 3.3 V on a 3.3 V microcontroller: the outputs swing to VCC.
from machine import Pin


class LineTracker5:
    def __init__(self, out1, out2, out3, out4, out5):
        # Push-pull 74HC14 outputs: no pull-up needed.
        self.pins = [p if not isinstance(p, int) else Pin(p, Pin.IN)
                     for p in (out1, out2, out3, out4, out5)]

    def raw(self):
        """Logic levels of OUT1..OUT5: 1 = white/reflective, 0 = black line or nothing in range."""
        return [p.value() for p in self.pins]

    def black(self):
        """List of 5 booleans, True where that sensor sits over the black line (OUT low)."""
        return [p.value() == 0 for p in self.pins]

    def pattern(self):
        """String such as '00100': '1' = black line under OUT1..OUT5 (left to right as printed)."""
        return ''.join('1' if b else '0' for b in self.black())

    def position(self):
        """Line position from -2 (under OUT1) to +2 (under OUT5), averaged over the sensors
        that see black; None when no sensor sees the line, or when all five do
        (lifted off the floor, or crossing a wide marker)."""
        b = self.black()
        n = sum(b)
        if n == 0 or n == 5:
            return None
        return sum(i - 2 for i in range(5) if b[i]) / n
