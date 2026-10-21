# Seeed Grove - Ultrasonic Ranger (v2.0) MicroPython driver.
# Trigger and echo share ONE pin (SIG). Per the Seeed wiki: drive SIG high for at
# least 10 us; the module sends eight 40 kHz cycles, then drives SIG high for the
# round-trip time of the sound. Distance = high time x 340 m/s / 2, i.e.
# cm = high-time(us) / 58.82. Range 2-350 cm, 1 cm resolution.
# SIG has a 10 kOhm pull-down on the module and swings to VCC (3.2-5.2 V):
# power it from 3.3 V on ESP32 / Pico so SIG never exceeds 3.3 V.
# Leave at least 60 ms between measurements so the previous echo has died away.
from machine import Pin, time_pulse_us
import time

US_PER_CM = 2 / 0.034   # 58.82 us per cm (sound at 340 m/s, out and back)
MIN_CM = 2
MAX_CM = 350


class GroveUltrasonicRanger:
    def __init__(self, pin, timeout_us=30000):
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.timeout_us = timeout_us
        self._last = time.ticks_ms() - 60

    def pulse_us(self):
        """Echo high time in us, or None if no echo arrived within the timeout."""
        wait = 60 - time.ticks_diff(time.ticks_ms(), self._last)
        if wait > 0:
            time.sleep_ms(wait)
        p = self.pin
        p.init(Pin.OUT, value=0)
        time.sleep_us(2)
        p.value(1)
        time.sleep_us(10)          # trigger: at least 10 us high
        p.value(0)
        p.init(Pin.IN)             # release SIG so the module can drive the echo
        t = time_pulse_us(p, 1, self.timeout_us)
        self._last = time.ticks_ms()
        if t < 0:                  # -1: echo never went high, -2: still high at timeout
            return None
        return t

    def distance_cm(self):
        """Distance in cm (float), or None when there is no valid echo / out of range."""
        t = self.pulse_us()
        if t is None:
            return None
        cm = t / US_PER_CM
        if cm < MIN_CM or cm > MAX_CM + 50:
            return None
        return cm

    def distance_mm(self):
        cm = self.distance_cm()
        return None if cm is None else cm * 10

    def distance_inch(self):
        cm = self.distance_cm()
        return None if cm is None else cm / 2.54
