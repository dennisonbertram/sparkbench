# SG90 360-degree continuous-rotation micro servo, MicroPython driver.
# Standard RC servo signal: one positive pulse every 20 ms (50 Hz).
# On the continuous version the pulse sets SPEED and DIRECTION, not angle:
#   ~1500 us = stop (the stop point varies a little per unit: trim stop_us),
#   1000 us  = full speed clockwise, 2000 us = full speed anticlockwise
#   (Smarthon SG90 360 table; some clones run the other way - test yours).
# ProtoSupplies measured the stop zone as roughly 1420-1580 us.
# Supply 4.8-6 V (5 V typical); a 3.3 V signal from an ESP32 / Pico works.
from machine import Pin, PWM

PERIOD_US = 20000  # 50 Hz frame


class SG90_360:
    def __init__(self, pin, stop_us=1500, span_us=500):
        self.stop_us = stop_us   # pulse that stops the motor (calibrate per unit)
        self.span_us = span_us   # stop_us +/- span_us = full speed
        self.pwm = PWM(pin if isinstance(pin, Pin) else Pin(pin), freq=50)
        self.pwm.duty_u16(0)     # no pulses: motor idle

    def write_us(self, us):
        us = max(self.stop_us - self.span_us, min(self.stop_us + self.span_us, us))
        self.pwm.duty_u16(int(us * 65535 // PERIOD_US))

    def speed(self, pct):
        """pct -100..100: negative = clockwise, positive = anticlockwise, 0 = stop."""
        pct = max(-100, min(100, pct))
        self.write_us(self.stop_us + self.span_us * pct / 100)

    def stop(self):
        self.write_us(self.stop_us)

    def off(self):
        """Stop sending pulses: the motor stops and the servo idles (about 10 mA)."""
        self.pwm.duty_u16(0)

    def deinit(self):
        self.pwm.deinit()
