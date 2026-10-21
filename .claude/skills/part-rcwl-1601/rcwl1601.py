# RCWL-1601 ultrasonic distance sensor (HC-SR04 compatible, GPIO mode), MicroPython driver.
# Trig: hold high for at least 10 us to start a measurement.
# Echo: goes high for the time the 40 kHz burst takes to reach the object and come back.
# Distance = echo time x speed of sound / 2  (343 m/s at 20 degC -> about 58.3 us per cm).
# Wait at least 50 ms between measurements (datasheet measurement cycle).
from machine import Pin, time_pulse_us
import time

SOUND_CM_PER_US = 0.0343  # 343 m/s at about 20 degC


class RCWL1601:
    def __init__(self, trig, echo, timeout_us=30000):
        # timeout 30 ms covers the 450 cm maximum range (about 26 ms round trip)
        self.trig = Pin(trig, Pin.OUT, value=0)
        self.echo = Pin(echo, Pin.IN)
        self.timeout_us = timeout_us
        self._last = time.ticks_ms() - 60

    def pulse_us(self):
        """Echo pulse width in microseconds, or None if no echo arrived."""
        wait = 50 - time.ticks_diff(time.ticks_ms(), self._last)
        if wait > 0:
            time.sleep_ms(wait)
        self.trig.value(0)
        time.sleep_us(2)
        self.trig.value(1)
        time.sleep_us(10)
        self.trig.value(0)
        self._last = time.ticks_ms()
        t = time_pulse_us(self.echo, 1, self.timeout_us)
        if t < 0:
            return None
        return t

    def distance_cm(self):
        """Distance to the nearest object in cm (about 2-450), or None if no echo."""
        t = self.pulse_us()
        if t is None:
            return None
        return t * SOUND_CM_PER_US / 2

    def distance_mm(self):
        cm = self.distance_cm()
        return None if cm is None else cm * 10
