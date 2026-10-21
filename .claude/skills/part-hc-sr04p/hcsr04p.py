# HC-SR04P ultrasonic distance sensor (RCWL-9610 controller, HC-SR04 compatible GPIO mode),
# MicroPython driver.
# Datasheet behaviour: hold Trig high for at least 10 us; the module then sends eight 40 kHz
# pulses and raises Echo for the round-trip time of the sound.
# Distance: cm = high-time(us) / 58 (speed of sound 340 m/s; 58.3 at 343 m/s, 20 degC).
# Leave at least 60 ms between measurements so the last echo has died away.
# Runs on 3-5.5 V; Echo swings to VCC, so power it from 3.3 V on 3.3 V boards.
from machine import Pin, time_pulse_us
import time

US_PER_CM = 58.3      # 2 / 0.0343 cm/us (sound at about 20 degC)
MIN_CM = 2            # blind zone
MAX_CM = 400          # rated range at 3.3 V (about 450 cm at 5 V)


class HCSR04P:
    def __init__(self, trig, echo, timeout_us=30000):
        self.trig = Pin(trig, Pin.OUT, value=0) if isinstance(trig, int) else trig
        self.echo = Pin(echo, Pin.IN) if isinstance(echo, int) else echo
        self.timeout_us = timeout_us
        self._last = time.ticks_ms() - 60

    def pulse_us(self):
        """Echo high time in us, or None if no echo arrived within the timeout."""
        wait = 60 - time.ticks_diff(time.ticks_ms(), self._last)
        if wait > 0:
            time.sleep_ms(wait)
        self.trig.value(0)
        time.sleep_us(5)
        self.trig.value(1)
        time.sleep_us(10)          # trigger: at least 10 us high
        self.trig.value(0)
        t = time_pulse_us(self.echo, 1, self.timeout_us)
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
