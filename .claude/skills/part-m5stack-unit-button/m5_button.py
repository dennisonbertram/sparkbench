# M5Stack Unit Button (U027), MicroPython driver.
# Schematic (UNIT_BUTTON V1.0): the push button S1 shorts the Grove signal (J1 pin 1,
# white wire) to GND. The signal is held up by R1 10 kOhm to VCC (Grove 5 V) and loaded by
# R2 20 kOhm to GND, with C1 100 nF to GND for hardware debounce. So:
#   released -> 5 V x 20k / (10k + 20k) = about 3.3 V  (reads 1)
#   pressed  -> 0 V                                   (reads 0)  -- active low
# The 10k/20k divider keeps the high level about 3.3 V when the unit is fed 5 V, so the
# signal is safe for 3.3 V GPIOs. Do NOT enable a GPIO pull-down (it would fight the divider);
# no pull-up is needed either. Fed from 3.3 V the high level is only ~2.2 V (below the
# ESP32 input-high threshold), so power the unit from 5 V.
from machine import Pin
import time


class M5Button:
    def __init__(self, pin, debounce_ms=10):
        """pin: GPIO number (or Pin) wired to the Grove signal (white wire)."""
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms
        self._last = 1

    def value(self):
        """Raw level: 1 = released, 0 = pressed."""
        return self.pin.value()

    def _stable(self):
        v = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            n = self.pin.value()
            if n != v:
                v = n
                t0 = time.ticks_ms()
        return v

    def is_pressed(self):
        """True while the button is held down (debounced)."""
        return self._stable() == 0

    def was_pressed(self):
        """True once for each new press; call it often in a loop."""
        v = self._stable()
        edge = self._last == 1 and v == 0
        self._last = v
        return edge

    def irq(self, handler, on_press=True):
        """Call handler(pin) on press (falling edge) or release (on_press=False)."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_press else Pin.IRQ_RISING)
