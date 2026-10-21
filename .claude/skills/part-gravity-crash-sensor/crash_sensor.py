# DFRobot Gravity: Digital Crash Sensor (SEN0138-L / SEN0138-R), MicroPython driver.
# The board is a snap-action micro switch with a roller lever (schematic v1.0, 2012):
#   D (pin 1) is pulled up to VCC by R2 = 10 kOhm; the switch K shorts D to GND when the lever is pressed.
#   A status LED with R1 = 1 kOhm from VCC to D lights while the switch is pressed.
# So: released -> D reads 1 (VCC), pressed -> D reads 0. No chip, no protocol.
# Power VCC from 3.3 V on an ESP32 / Pico so the high level on D stays at 3.3 V.
# Snap-action contacts bounce for a few milliseconds: readings are debounced.
from machine import Pin
import time


class CrashSensor:
    def __init__(self, pin, debounce_ms=10):
        """pin: GPIO number (or Pin) wired to the board's D pin."""
        if isinstance(pin, int):
            # The board has its own 10 kOhm pull-up; no internal pull is needed.
            pin = Pin(pin, Pin.IN)
        self.pin = pin
        self.debounce_ms = debounce_ms

    def value(self):
        """Raw level on D: 0 = pressed, 1 = released."""
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
        """True while the lever is pressed (switch closed, D pulled to GND). Debounced."""
        return self._stable() == 0

    def irq(self, handler, on_press=True):
        """Call handler(pin) when the lever is pressed (falling edge) or released (on_press=False).
        Contacts bounce, so a handler may fire more than once per movement."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_press else Pin.IRQ_RISING)
