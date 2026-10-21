# YF-S401 hall-effect water flow sensor, MicroPython driver.
# A magnet on the rotor passes a hall-effect sensor; the yellow OUT wire gives a
# square wave (50 % +/- 10 % duty) whose frequency follows the flow:
#   F [Hz] = 98 * Q [L/min]  (+/- 2 %)   ->  5880 pulses per litre
# Rated flow 0.3-6 L/min. Supply 4.5/5-24 V DC (red wire), 15 mA at 5 V.
# The output high level is about the supply (> 4.7 V at 5 V), so on a 3.3 V
# board (ESP32, Pico) put a divider or level shifter between OUT and the GPIO.
from machine import Pin
import time

HZ_PER_LPM = 98          # datasheet: F = 98 * Q
PULSES_PER_LITRE = HZ_PER_LPM * 60   # 5880


class YFS401:
    def __init__(self, pin, hz_per_lpm=HZ_PER_LPM, pull=None):
        """pin: GPIO number (or Pin) wired to OUT (yellow). hz_per_lpm: the
        K factor, 98 from the datasheet; calibrate it with a measuring jug for
        better accuracy. pull: e.g. Pin.PULL_UP if your wiring needs it."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, pull) if pull is not None else Pin(pin, Pin.IN)
        self.pin = pin
        self.k = hz_per_lpm
        self._count = 0
        self.pin.irq(handler=self._edge, trigger=Pin.IRQ_RISING)

    def _edge(self, pin):
        self._count += 1

    def pulses(self):
        """Rising edges counted since start or reset()."""
        return self._count

    def reset(self):
        self._count = 0

    def litres(self):
        """Total volume since start or reset(), in litres."""
        return self._count / (self.k * 60)

    def flow(self, window_ms=1000):
        """Count pulses for window_ms and return the flow rate in L/min."""
        start = self._count
        t0 = time.ticks_ms()
        time.sleep_ms(window_ms)
        n = self._count - start
        dt = time.ticks_diff(time.ticks_ms(), t0)
        if dt <= 0:
            return 0.0
        hz = n * 1000 / dt
        return hz / self.k
