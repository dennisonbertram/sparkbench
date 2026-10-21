# ULN2003 stepper driver board + 28BYJ-48 unipolar stepper, MicroPython driver.
# The ULN2003A (TI) is seven Darlington low-side switches: input high (>= 2.7 V at 250 mA,
# 2.7 kOhm series resistor on chip) = that output sinks current = that motor coil is energised.
# The board feeds the motor's red common wire from VCC (5 V for the 5 V 28BYJ-48) and OUT1-OUT4 to the
# four coil ends, so driving IN1..IN4 is driving the four coils directly. 3.3 V GPIOs are enough.
#
# Half-step sequence (28BYJ-48 datasheet, 8 steps, one or two coils on at a time). Running the
# table forwards turns the shaft one way, backwards the other. One output-shaft turn is about
# 4096 half-steps (gear ratio 64:1 nominal, 63.68:1 actual, so 4076 is more exact).
# The motor's idle in-traction frequency is > 600 Hz, so keep the step delay >= 2 ms.
from machine import Pin
import time

HALF_STEP = (
    (1, 0, 0, 0),
    (1, 1, 0, 0),
    (0, 1, 0, 0),
    (0, 1, 1, 0),
    (0, 0, 1, 0),
    (0, 0, 1, 1),
    (0, 0, 0, 1),
    (1, 0, 0, 1),
)

FULL_STEP = (
    (1, 1, 0, 0),
    (0, 1, 1, 0),
    (0, 0, 1, 1),
    (1, 0, 0, 1),
)

STEPS_PER_REV_HALF = 4096
STEPS_PER_REV_FULL = 2048


class ULN2003Stepper:
    def __init__(self, in1, in2, in3, in4, delay_ms=2, half_step=True):
        """in1..in4: GPIO numbers wired to the board's IN1..IN4 (in that order)."""
        self.pins = [Pin(p, Pin.OUT, value=0) for p in (in1, in2, in3, in4)]
        self.seq = HALF_STEP if half_step else FULL_STEP
        self.delay_ms = max(2, delay_ms)
        self.index = 0
        self.position = 0

    def _apply(self, pattern):
        for pin, v in zip(self.pins, pattern):
            pin.value(v)

    def step(self, count):
        """Move count steps; a negative count turns the other way. Coils stay energised afterwards
        (holding torque) until release() is called."""
        direction = 1 if count >= 0 else -1
        n = len(self.seq)
        for _ in range(abs(count)):
            self.index = (self.index + direction) % n
            self._apply(self.seq[self.index])
            self.position += direction
            time.sleep_ms(self.delay_ms)

    def rotate(self, degrees):
        """Turn the output shaft by roughly this many degrees."""
        per_rev = STEPS_PER_REV_HALF if self.seq is HALF_STEP else STEPS_PER_REV_FULL
        self.step(round(degrees * per_rev / 360))

    def release(self):
        """Switch every coil off: no holding torque, no current draw, motor stays cool."""
        self._apply((0, 0, 0, 0))
