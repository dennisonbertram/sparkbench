# YF-S201 1/2" Hall-effect water flow sensor, MicroPython driver.
# A magnet on the turbine rotor passes a Hall sensor; the yellow OUT wire gives one
# pulse per step of the rotor. Datasheet: F (Hz) = 7.5 x Q (L/min), i.e. 450 pulses
# per litre, duty 50 % +-10 %. OUT only pulls low and needs a pull-up; Seeed specifies a high
# level > 4.5 V with a 5 V pull-up. On a 3.3 V board pull it up to 5 V (4.7 kOhm) and take it to the
# GPIO through a divider (10 kOhm OUT -> pin, 20 kOhm pin -> GND): about 2.9 V high, never above 3.3 V.
from machine import Pin
import time

HZ_PER_LPM = 7.5          # datasheet: F = 7.5 * Q
PULSES_PER_LITRE = 450    # 7.5 Hz per L/min * 60 s


class YFS201:
    def __init__(self, pin, pull_up=False, k=HZ_PER_LPM):
        """pin: GPIO number (or Pin) wired to OUT. pull_up: also enable the GPIO's
        internal pull-up (only when OUT is wired straight to the pin with no pull-up of its own).
        k: pulses per second per L/min (7.5 nominal, +-10 %; calibrate by filling
        a known volume and set k = pulses / litres / 60)."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.k = k
        self._count = 0
        self.pin.irq(handler=self._edge, trigger=Pin.IRQ_RISING)

    def _edge(self, pin):
        self._count += 1

    def pulses(self):
        """Pulses counted since start or the last reset()."""
        return self._count

    def reset(self):
        self._count = 0

    def litres(self):
        """Total volume since start / reset(), in litres."""
        return self._count / (self.k * 60)

    def flow(self, window_ms=1000):
        """Count pulses for window_ms and return the flow rate in L/min (Q = F / 7.5)."""
        start = self._count
        t0 = time.ticks_ms()
        time.sleep_ms(window_ms)
        n = self._count - start
        dt = time.ticks_diff(time.ticks_ms(), t0) / 1000
        return n / dt / self.k
