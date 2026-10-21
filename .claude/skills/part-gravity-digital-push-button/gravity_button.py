# DFRobot Gravity: Digital Push Button (DFR0029-R/-Y/-G/-B/-W), MicroPython driver.
# Board (DFRobot schematic "Digital Push Button" V2): a 12 mm tactile key from VCC to an internal node;
# that node has a 10 kOhm pull-down (R3) to GND, a 1 kOhm + LED (R2, D1) to GND, and reaches the
# D pin through a 1 kOhm series resistor (R1).
#   pressed  -> D = HIGH (VCC), the on-board LED lights
#   released -> D = LOW (10 kOhm pull-down)
# Gravity 3-pin connector J1: pin 1 D (green), pin 2 VCC (red), pin 3 GND (black). Supply 3.3-5 V.
# D swings to VCC, so on an ESP32 / Pico power the module from 3.3 V.
# Do not enable the GPIO's internal pull-up: the board already pulls D down.
from machine import Pin
import time


class GravityButton:
    def __init__(self, pin, debounce_ms=10):
        """pin: GPIO number (or Pin) wired to the module's D pin."""
        if isinstance(pin, int):
            pin = Pin(pin, Pin.IN)
        self.pin = pin
        self.debounce_ms = debounce_ms
        self._last = 0

    def value(self):
        """Raw level on D: 1 = pressed, 0 = released."""
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
        """True while the button is held down. Debounced."""
        return self._stable() == 1

    def was_pressed(self):
        """True once for each new press (released -> pressed edge); call it often in a loop."""
        v = self._stable()
        edge = self._last == 0 and v == 1
        self._last = v
        return edge

    def irq(self, handler, on_press=True):
        """Call handler(pin) on press (rising edge) or release (falling edge, on_press=False).
        The key bounces, so a handler may fire more than once per press."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if on_press else Pin.IRQ_FALLING)
