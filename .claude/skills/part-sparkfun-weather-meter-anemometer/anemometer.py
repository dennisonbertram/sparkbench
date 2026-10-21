# SparkFun Weather Meter Kit (SEN-15901) cup anemometer, MicroPython driver.
# The anemometer is passive: a magnet on the rotor closes a sealed reed switch, and a wind
# speed of 2.4 km/h (1.492 mph) closes it once per second (SparkFun datasheet / hookup guide).
# Its switch is on the two inner conductors (pins 2 and 3) of the RJ11 cable it shares with
# the wind vane. Not polarised, no supply, no chip: wire one conductor to GND and the other to
# a GPIO with a pull-up; each closure pulls the pin low.
# Speed is measured from the time between the first and last falling edge inside a window,
# so there is no +/-1 pulse quantisation error. Reed contacts bounce for well under a
# millisecond, so edges closer than lockout_us (default 4 ms, i.e. up to 250 Hz = 600 km/h)
# to the previous counted edge are ignored.
import machine
from machine import Pin
import time

KMH_PER_HZ = 2.4      # 1 closure per second = 2.4 km/h
MPH_PER_HZ = 1.492    # 1 closure per second = 1.492 mph


class Anemometer:
    def __init__(self, pin, lockout_us=4000, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.lockout_us = lockout_us
        self._count = 0
        self._first = 0
        self._last = 0
        self._total = 0
        self.pin.irq(trigger=Pin.IRQ_FALLING, handler=self._on_edge)

    def _on_edge(self, p):
        now = time.ticks_us()
        if self._count and time.ticks_diff(now, self._last) < self.lockout_us:
            return  # contact bounce
        if self._count == 0:
            self._first = now
        self._last = now
        self._count += 1
        self._total += 1

    def _restart(self):
        s = machine.disable_irq()
        self._count = 0
        machine.enable_irq(s)

    def _snapshot(self):
        s = machine.disable_irq()
        n, t0, t1 = self._count, self._first, self._last
        machine.enable_irq(s)
        return n, t0, t1

    def frequency(self, window_ms=2000):
        """Measure for window_ms and return switch closures per second (Hz).
        Needs at least two closures in the window, else returns 0 (below 2.4 / (window_ms/1000) km/h)."""
        self._restart()
        time.sleep_ms(window_ms)
        n, t0, t1 = self._snapshot()
        dt = time.ticks_diff(t1, t0)
        if n < 2 or dt <= 0:
            return 0.0
        return (n - 1) * 1000000 / dt

    def speed_kmh(self, window_ms=2000):
        """Wind speed in km/h (Hz x 2.4)."""
        return self.frequency(window_ms) * KMH_PER_HZ

    def speed_mph(self, window_ms=2000):
        """Wind speed in mph (Hz x 1.492)."""
        return self.frequency(window_ms) * MPH_PER_HZ

    def speed_ms(self, window_ms=2000):
        """Wind speed in m/s (km/h / 3.6)."""
        return self.speed_kmh(window_ms) / 3.6

    def closures(self):
        """Total switch closures since start-up (for wind-run / averaging over long periods)."""
        return self._total
