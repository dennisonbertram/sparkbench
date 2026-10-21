# KY-004 push button module, MicroPython driver.
# The Joy-IT / Keyes sensor-kit board is a 6x6 mm tactile push button between S and
# GND (-) plus a 10 kOhm pull-up resistor (marked 103) from S to the middle + pin. So S is:
#   HIGH (1) while the button is released
#   LOW  (0) while the button is held down (S shorted to GND) -> "pressed"
# Some other KY-004 clones wire the resistor as a pull-down instead (S LOW at rest,
# HIGH when pressed); pass active_low=False for those.
# The contacts bounce for a few milliseconds at each press/release, so readings are debounced.
# Power + from 3.3 V on a 3.3 V board: the pull-up takes S up to the + supply.
from machine import Pin
import time


class KY004:
    def __init__(self, pin, active_low=True, debounce_ms=20):
        self.active_low = active_low
        if isinstance(pin, int):
            # On the pull-up board an internal pull-up is harmless and keeps S defined
            # if + is left unconnected; on a pull-down clone leave the pin plain.
            self.pin = Pin(pin, Pin.IN, Pin.PULL_UP if active_low else None)
        else:
            self.pin = pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on S right now (0 or 1)."""
        return self.pin.value()

    def is_down(self):
        """Undebounced: True while the button is held."""
        return self.pin.value() == (0 if self.active_low else 1)

    def pressed(self):
        """Debounced: True if the button stays held for debounce_ms."""
        state = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            v = self.pin.value()
            if v != state:
                state = v
                t0 = time.ticks_ms()
            time.sleep_ms(2)
        return state == (0 if self.active_low else 1)

    def irq(self, handler, on_press=True):
        """Call handler(pin) on press (or on release with on_press=False).
        Expect several calls per press because the contacts bounce."""
        falling = on_press == self.active_low
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if falling else Pin.IRQ_RISING)
