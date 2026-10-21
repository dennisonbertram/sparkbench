# SparkFun Weather Meter Kit (SEN-15901) tipping-bucket rain gauge, MicroPython driver.
# The gauge is passive: a sealed reed switch on the two centre conductors of its RJ11 cable
# closes momentarily each time the self-emptying bucket tips, once per 0.2794 mm (0.011 in)
# of rain (SparkFun datasheet / hookup guide). Not polarised, no supply, no chip.
# Wire one conductor to GND and the other to a GPIO with a pull-up; each tip pulls the pin
# low briefly. Reed contacts bounce for a few ms on closing and again on opening, so after a
# counted tip every further falling edge is ignored for lockout_ms (default 500 ms). That caps
# the count at 2 tips/s (about 2000 mm/h), far above any real rain rate (the datasheet also
# suggests an RC filter at the connector against bounce and noise on long cables).
import machine
from machine import Pin
import time

MM_PER_TIP = 0.2794


class RainGauge:
    def __init__(self, pin, mm_per_tip=MM_PER_TIP, lockout_ms=500, pull_up=True):
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        self.pin = pin
        self.mm_per_tip = mm_per_tip
        self.lockout_ms = lockout_ms
        self._tips = 0
        self._last = time.ticks_add(time.ticks_ms(), -lockout_ms)
        self.pin.irq(trigger=Pin.IRQ_FALLING, handler=self._on_edge)

    def _on_edge(self, p):
        # Each bucket tip closes the reed switch once: count the first falling edge and ignore
        # the bounce (closing and opening) that follows within lockout_ms.
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last) >= self.lockout_ms:
            self._tips += 1
            self._last = now

    def tips(self):
        """Bucket tips counted since start-up or the last reset()."""
        return self._tips

    def rainfall_mm(self):
        """Accumulated rain in millimetres (tips x 0.2794 mm)."""
        return self._tips * self.mm_per_tip

    def rainfall_in(self):
        """Accumulated rain in inches (tips x 0.011 in)."""
        return self.rainfall_mm() / 25.4

    def reset(self):
        """Clear the tip count."""
        s = machine.disable_irq()
        self._tips = 0
        machine.enable_irq(s)

    def take(self):
        """Return the tips counted since the last take() and clear the count (for per-interval rates)."""
        s = machine.disable_irq()
        n = self._tips
        self._tips = 0
        machine.enable_irq(s)
        return n
