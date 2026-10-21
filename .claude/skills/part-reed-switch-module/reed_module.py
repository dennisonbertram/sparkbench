# LM393 reed switch sensor module (3-pin VCC / GND / DO), MicroPython driver.
# Board circuit (SunFounder schematic): a normally-open reed switch pulls the LM393's
# + input to GND (10 kOhm pull-up to VCC, 100 nF across the reed); the blue 10 kOhm
# trimmer sets the - input. The LM393 open-collector output has a 10 kOhm pull-up to
# VCC and drives the DO-LED (1 kOhm), so:
#   DO HIGH (1) with no magnet (reed open, DO-LED off)
#   DO LOW  (0) while a magnet closes the reed (DO-LED lit)  -> "magnet"
# The reeds bounce for a few ms at each change; the 100 nF cap smooths most of it,
# and magnet() also waits for a stable level. Power VCC from 3.3 V on a 3.3 V board,
# because DO is pulled up to VCC.
from machine import Pin
import time


class ReedModule:
    def __init__(self, pin, debounce_ms=20):
        """pin: GPIO number (or Pin) wired to DO."""
        # The board has its own 10 kOhm pull-up on DO, so no internal pull is needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on DO right now: 0 = magnet (reed closed), 1 = no magnet."""
        return self.pin.value()

    def closed(self):
        """True while DO is LOW (reed closed by a magnet), undebounced."""
        return self.pin.value() == 0

    def magnet(self):
        """Debounced: True if DO stays LOW for debounce_ms."""
        state = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            v = self.pin.value()
            if v != state:
                state = v
                t0 = time.ticks_ms()
            time.sleep_ms(2)
        return state == 0

    def irq(self, handler, on_close=True):
        """Call handler(pin) when a magnet arrives (falling edge) or, with
        on_close=False, when it leaves (rising edge). Bounce can give extra calls."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_close else Pin.IRQ_RISING)
