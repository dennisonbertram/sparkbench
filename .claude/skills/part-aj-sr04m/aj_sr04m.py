# AJ-SR04M waterproof ultrasonic module, mode 1 (R19 open, factory default):
# HC-SR04 compatible trigger/echo. MicroPython driver.
# Datasheet (user manual): a TTL high pulse of more than 10 us on Trig starts a
# measurement; the module sends a 40 kHz burst and then holds Echo high for the
# sound's round-trip time ("distance height"). Range 20-800 cm (blind zone 20 cm).
# Distance = echo high time x speed of sound / 2  (343 m/s at 20 C -> 58.3 us per cm).
from machine import Pin, time_pulse_us
import time

US_PER_CM = 58.3          # 2 / 343 m/s, round trip at about 20 C
MIN_CM = 20               # blind zone
MAX_CM = 800              # furthest range in the datasheet


class AJSR04M:
    def __init__(self, trig, echo, timeout_us=60000):
        # 800 cm needs about 46.6 ms of echo, so 60 ms covers the full range.
        self.trig = Pin(trig, Pin.OUT, value=0)
        self.echo = Pin(echo, Pin.IN)
        self.timeout_us = timeout_us

    def pulse_us(self):
        """Echo high time in us, or None on timeout / no echo."""
        self.trig.value(0)
        time.sleep_us(5)
        self.trig.value(1)
        time.sleep_us(15)          # datasheet: > 10 us TTL trigger
        self.trig.value(0)
        t = time_pulse_us(self.echo, 1, self.timeout_us)
        if t < 0:
            return None
        return t

    def distance_cm(self, temp_c=None):
        """Distance in cm (about 20-800), or None if there was no valid echo.
        Pass temp_c to correct the speed of sound for air temperature."""
        t = self.pulse_us()
        if t is None:
            return None
        if temp_c is None:
            return t / US_PER_CM
        v = 331.3 + 0.606 * temp_c          # m/s
        return t * v / 20000                # us * m/s / 2 -> cm

    def distance_mm(self):
        d = self.distance_cm()
        return None if d is None else d * 10
