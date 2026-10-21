# TowerPro SG92R micro servo (carbon-fibre gears), MicroPython driver.
# Datasheet / vendor: 50 Hz (20 ms) frame; 1.5 ms pulse = middle ("0"),
# ~1 ms = full left ("-90"), ~2 ms = full right ("+90"). Dead band 1 us.
# Supply 4.8 V nominal (signal is 3.3 V logic-compatible).
# Angles here run 0..180 degrees: 0 = 1 ms (left), 90 = 1.5 ms (middle), 180 = 2 ms (right).
from machine import Pin, PWM

PERIOD_US = 20000  # 50 Hz frame


class SG92R:
    def __init__(self, pin, min_us=1000, max_us=2000, degrees=180):
        # 1-2 ms may not give the full 180 degrees; Adafruit suggests trying 750-2250 us.
        # Widen in small steps and back off if the servo buzzes against its end stop.
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
