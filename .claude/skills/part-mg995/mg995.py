# TowerPro MG995 metal-gear RC servo, MicroPython driver.
# Standard RC servo signal (datasheet): one positive pulse every 20 ms (50 Hz).
# 1.5 ms = centre; the servo turns about 120 degrees in all (60 each way), so this
# driver maps 1.0 ms -> 0 deg, 1.5 ms -> 60 deg, 2.0 ms -> 120 deg.
# Units vary: widen min_us/max_us carefully only if yours has travel to spare and
# does not buzz or stall at the ends.
from machine import Pin, PWM


class MG995:
    def __init__(self, pin, min_us=1000, max_us=2000, degrees=120, freq=50):
        self.min_us = min_us
        self.max_us = max_us
        self.degrees = degrees
        self.period_us = 1000000 // freq
        self.pwm = PWM(Pin(pin), freq=freq)
        self.pwm.duty_u16(0)  # no pulses until an angle is set

    def pulse_us(self, us):
        """Send pulses of `us` microseconds (clamped to min_us..max_us)."""
        us = max(self.min_us, min(self.max_us, us))
        self.pwm.duty_u16(int(us * 65535 // self.period_us))

    def angle(self, deg):
        """Turn to `deg` degrees (0..degrees)."""
        deg = max(0, min(self.degrees, deg))
        self.pulse_us(self.min_us + deg * (self.max_us - self.min_us) / self.degrees)

    def off(self):
        """Stop sending pulses: the servo goes limp and stops drawing much current."""
        self.pwm.duty_u16(0)

    def deinit(self):
        self.pwm.deinit()
