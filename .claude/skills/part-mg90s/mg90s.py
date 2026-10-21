# TowerPro MG90S metal-gear micro servo, MicroPython driver.
# Datasheet: 50 Hz (20 ms) frame; 1.5 ms pulse = middle, ~1 ms = full left (-90),
# ~2 ms = full right (+90). Dead band 5 us. Supply 4.8-6.0 V (signal is 3.3 V logic-compatible).
# Angles here run 0..180 degrees: 0 = 1 ms (left), 90 = 1.5 ms (middle), 180 = 2 ms (right).
from machine import Pin, PWM

PERIOD_US = 20000  # 50 Hz frame


class MG90S:
    def __init__(self, pin, min_us=1000, max_us=2000, degrees=180):
        # Many units travel a little further with 0.5-2.5 ms pulses; widen min_us/max_us
        # only in small steps and back off if the servo buzzes against its end stop.
        self.min_us = min_us
        self.max_us = max_us
        self.degrees = degrees
        self.pwm = PWM(pin if isinstance(pin, Pin) else Pin(pin), freq=50)
        self.pwm.duty_u16(0)  # no pulse until an angle is set

    def write_us(self, us):
        us = max(self.min_us, min(self.max_us, us))
        self.pwm.duty_u16(int(us * 65535 // PERIOD_US))

    def angle(self, deg):
        deg = max(0, min(self.degrees, deg))
        self.write_us(self.min_us + (self.max_us - self.min_us) * deg / self.degrees)

    def off(self):
        """Stop sending pulses: the servo goes limp and stops drawing holding current."""
        self.pwm.duty_u16(0)

    def deinit(self):
        self.pwm.deinit()
