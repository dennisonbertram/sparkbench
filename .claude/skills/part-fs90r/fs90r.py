# FEETECH FS90R micro continuous-rotation servo, MicroPython driver.
# Datasheet (FEETECH FS90R spec): pulse width range 700-2300 us, stop at 1500 us,
# dead band 90 us, CW for 1500->700 us, CCW for 1500->2300 us (seen from the horn side).
# Standard 50 Hz (20 ms) servo frame. Supply 4.8-6.0 V; 3.3 V signal logic works.
# The pulse sets SPEED and DIRECTION, not an angle. If it creeps at stop(), turn the
# trim potentiometer in the case (or pass a different stop_us).
from machine import Pin, PWM

PERIOD_US = 20000  # 50 Hz frame


class FS90R:
    def __init__(self, pin, stop_us=1500, min_us=700, max_us=2300):
        self.stop_us = stop_us
        self.min_us = min_us
        self.max_us = max_us
        self.pwm = PWM(pin if isinstance(pin, Pin) else Pin(pin), freq=50)
        self.pwm.duty_u16(0)  # no pulses: motor off

    def write_us(self, us):
        us = max(self.min_us, min(self.max_us, us))
        self.pwm.duty_u16(int(us * 65535 // PERIOD_US))

    def speed(self, pct):
        """pct -100..100. Negative = clockwise (pulse < 1500 us), positive =
        counter-clockwise (pulse > 1500 us), 0 = stop. |pct| 100 = 700/2300 us."""
        pct = max(-100, min(100, pct))
        if pct < 0:
            us = self.stop_us + (self.stop_us - self.min_us) * pct / 100
        else:
            us = self.stop_us + (self.max_us - self.stop_us) * pct / 100
        self.write_us(int(us))

    def cw(self, pct=100):
        self.speed(-abs(pct))

    def ccw(self, pct=100):
        self.speed(abs(pct))

    def stop(self):
        """Send the 1500 us stop pulse (inside the 90 us dead band)."""
        self.write_us(self.stop_us)

    def off(self):
        """Stop sending pulses: the motor is unpowered and stops."""
        self.pwm.duty_u16(0)

    def deinit(self):
        self.pwm.deinit()
