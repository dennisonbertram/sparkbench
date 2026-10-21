# JSN-SR04T-2.0 waterproof ultrasonic distance module, MicroPython driver.
# Mode 1 (factory default, R27 not fitted): trigger/echo pulses.
# Datasheet: hold TRIG high for at least 10 us; the module sends 8 x 40 kHz and
# drives ECHO high for the sound's round trip. distance = high time x 340 m/s / 2,
# i.e. 58.82 us per cm. With no echo, ECHO stays high about 38 ms (and drops by
# 60 ms at the latest). Measure no more often than every 50-60 ms.
from machine import Pin, time_pulse_us
import time

US_PER_CM = 58.82      # 2 / 340 m/s, from the datasheet formula
MIN_CM = 20            # blind zone (datasheet "recent range")
MAX_CM = 600           # datasheet "farthest range"
_MAX_US = 36000        # longer than a 600 cm echo, shorter than the 38 ms no-echo pulse
_CYCLE_MS = 60         # datasheet: cycle period no less than 50 ms; ECHO ends by 60 ms


class JSNSR04T:
    def __init__(self, trig, echo, trigger_us=20):
        # trig / echo: GPIO numbers or Pin objects
        self.trig = trig if isinstance(trig, Pin) else Pin(trig, Pin.OUT, value=0)
        self.trig.init(Pin.OUT, value=0)
        self.echo = echo if isinstance(echo, Pin) else Pin(echo, Pin.IN)
        # 10 us is the datasheet minimum; 20 us is more reliable on 3.3 V supplies
        self.trigger_us = max(10, trigger_us)
        self._last = time.ticks_add(time.ticks_ms(), -_CYCLE_MS)

    def pulse_us(self):
        """Raw ECHO high time in us, or None if no valid echo."""
        wait = _CYCLE_MS - time.ticks_diff(time.ticks_ms(), self._last)
        if wait > 0:
            time.sleep_ms(wait)
        self.trig.value(0)
        time.sleep_us(5)
        self.trig.value(1)
        time.sleep_us(self.trigger_us)
        self.trig.value(0)
        self._last = time.ticks_ms()
        t = time_pulse_us(self.echo, 1, 70000)
        if t < 0 or t > _MAX_US:
            return None   # timeout, or the 38 ms "nothing detected" pulse
        return t

    def distance_cm(self):
        """Distance in cm (about 20-600), or None if out of range / no echo."""
        t = self.pulse_us()
        if t is None:
            return None
        return t / US_PER_CM

    def distance_mm(self):
        d = self.distance_cm()
        return None if d is None else int(d * 10 + 0.5)
