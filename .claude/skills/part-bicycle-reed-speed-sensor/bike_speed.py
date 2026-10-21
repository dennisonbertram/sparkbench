# Wired bicycle speed / cadence sensor (2-wire reed switch + spoke or crank magnet), MicroPython driver.
# The sensor is passive: a normally-open reed switch in the fork-mounted housing closes once per wheel
# revolution, each time the spoke magnet passes within about 5 mm, connecting the two wires of its cable.
# Wire one lead to GND and the other to a GPIO with a pull-up: the pin idles at 1 and dips to 0 briefly
# once per revolution. On a crank arm with a pedal magnet the same sensor gives cadence (1 pulse per
# crank turn).
#
# Debounce: reed contacts chatter for about a millisecond when they close and when they open. The
# handler watches both edges and counts a closure (falling edge) only if the line had been high for at
# least debounce_ms and at least min_period_ms has passed since the last counted closure. That rejects
# chatter on closing and on opening at any speed, and allows up to 60000/min_period_ms rpm
# (default 20 ms: 3000 rpm, about 377 km/h on a 2096 mm wheel).
#
# Speed is the average period between counted closures, which is exact to a millisecond or so, instead
# of a count per time window (which jitters by one pulse).
import machine
from machine import Pin
import time


class BikeSpeedSensor:
    def __init__(self, pin, circumference_mm=2096, debounce_ms=2, min_period_ms=20,
                 timeout_ms=3000, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.circumference_mm = circumference_mm
        self.debounce_ms = debounce_ms
        self.min_period_ms = min_period_ms
        self.timeout_ms = timeout_ms
        now = time.ticks_ms()
        self._rise = time.ticks_add(now, -10000)   # last time the line went high (switch opened)
        self._last = None                          # time of the last counted closure
        self._ref = None                           # closure the current averaging window starts at
        self._n = 0                                # closures counted since _ref
        self._total = 0                            # all closures since start-up / reset_distance()
        self._rpm = 0.0
        self.pin.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=self._on_edge)

    def _on_edge(self, p):
        now = time.ticks_ms()
        if p.value():
            self._rise = now
            return
        if time.ticks_diff(now, self._rise) < self.debounce_ms:
            return          # chatter: the line was not high long enough
        if self._last is not None and time.ticks_diff(now, self._last) < self.min_period_ms:
            return          # chatter / faster than the sensor can turn
        self._last = now
        self._total += 1
        if self._ref is None:
            self._ref = now
        else:
            self._n += 1

    def rpm(self):
        """Revolutions per minute averaged over the closures since the previous call (0 when stopped)."""
        s = machine.disable_irq()
        n, ref, last = self._n, self._ref, self._last
        if n:
            self._ref = last
            self._n = 0
        machine.enable_irq(s)
        if n and ref is not None:
            dt = time.ticks_diff(last, ref)
            if dt > 0:
                self._rpm = n * 60000 / dt
        elif last is None or time.ticks_diff(time.ticks_ms(), last) > self.timeout_ms:
            self._rpm = 0.0
            s = machine.disable_irq()
            self._ref = None   # restart averaging from the next closure
            self._n = 0
            machine.enable_irq(s)
        return self._rpm

    def speed_kmh(self, rpm=None):
        """Road speed in km/h: rpm x wheel circumference. Pass rpm to reuse a reading from rpm()."""
        if rpm is None:
            rpm = self.rpm()
        return rpm * self.circumference_mm * 60 / 1e6

    def revolutions(self):
        """Wheel turns counted since start-up or reset_distance()."""
        return self._total

    def distance_m(self):
        return self._total * self.circumference_mm / 1000

    def reset_distance(self):
        s = machine.disable_irq()
        self._total = 0
        machine.enable_irq(s)
