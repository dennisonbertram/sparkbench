# DS04-NFC 360-degree continuous-rotation servo, MicroPython driver.
# Datasheet (Luxorparts / Kjell & Company 90770, model DS04-NFC):
#   50 Hz (20 ms) frame. 1.5 ms = stop. 1.0-1.5 ms = counter-clockwise
#   (full reverse at 1.0 ms), 1.5-2.0 ms = clockwise (full forward at 2.0 ms).
#   Speed is roughly linear with the pulse (0-45 RPM at 4.8 V).
#   Supply 4.8-6 V, current < 1000 mA. A 3.3 V signal works.
# The pulse sets SPEED and DIRECTION, not an angle. If it creeps at stop(),
# pass a slightly different stop_us (the axis has a small offset per unit).
from machine import Pin, PWM

PERIOD_US = 20000  # 50 Hz frame


class DS04NFC:
    def __init__(self, pin, stop_us=1500, min_us=1000, max_us=2000):
        self.stop_us = stop_us
        self.min_us = min_us
        self.max_us = max_us
        self.pwm = PWM(pin if isinstance(pin, Pin) else Pin(pin), freq=50)
        self.pwm.duty_u16(0)  # no pulses: motor off

    def write_us(self, us):
        us = max(self.min_us, min(self.max_us, us))
        self.pwm.duty_u16(int(us * 65535 // PERIOD_US))

    def speed(self, pct):
        """pct -100..100. Positive = clockwise / forward (pulse > 1.5 ms),
        negative = counter-clockwise / reverse (pulse < 1.5 ms), 0 = stop.
        |pct| 100 = 2.0 ms / 1.0 ms."""
        pct = max(-100, min(100, pct))
        if pct < 0:
            us = self.stop_us + (self.stop_us - self.min_us) * pct / 100
        else:
            us = self.stop_us + (self.max_us - self.stop_us) * pct / 100
        self.write_us(int(us))

    def cw(self, pct=100):
        self.speed(abs(pct))

    def ccw(self, pct=100):
        self.speed(-abs(pct))

    def stop(self):
        """Send the 1.5 ms stop pulse."""
        self.write_us(self.stop_us)

    def off(self):
        """Stop sending pulses: the motor is unpowered and stops."""
        self.pwm.duty_u16(0)

    def deinit(self):
        self.pwm.deinit()
