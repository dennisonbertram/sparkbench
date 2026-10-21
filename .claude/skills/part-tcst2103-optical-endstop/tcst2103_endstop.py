# TCST2103 optical endstop module (red RepRap / RAMPS 1.4 board, header V, S, G),
# MicroPython driver.
# Circuit (board silkscreen R1 = 181, R2 = 222; Jason-B "Improved Optical End-Stop" design):
#   V --180R--> IR LED of the Vishay TCST2103 --> G    (about 20 mA at 5 V)
#   V --2.2k--> S, and the TCST2103 phototransistor pulls S to G while light reaches it.
# So S is:
#   LOW  (0) while the slot is clear (phototransistor on, VCEsat <= 0.4 V)
#   HIGH (1) while a flag blocks the slot (transistor off, 2.2k pulls S to V)
# The board is meant to run from 5 V, so S swings to 5 V: on an ESP32 / Pico put a
# divider on S (e.g. 10k from S to the GPIO, 20k from the GPIO to GND); a logic
# high then reads about 3.1 V at the pin. The phototransistor switches in about
# 10 us (datasheet ton/toff), far faster than any axis.
from machine import Pin
import time


class TCST2103Endstop:
    def __init__(self, pin, debounce_ms=0):
        """pin: GPIO number (or Pin) wired to S (through the divider on a 3.3 V board).
        debounce_ms: optional, require the level to stay the same this long in
        triggered_stable() (useful for a flag that vibrates at the edge of the beam)."""
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def value(self):
        """Raw level on S: 1 = slot blocked, 0 = clear."""
        return self.pin.value()

    def triggered(self):
        """True while something blocks the slot (S high)."""
        return self.pin.value() == 1

    def triggered_stable(self):
        """Like triggered(), but only returns once S has held one level for debounce_ms."""
        level = self.pin.value()
        start = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), start) < self.debounce_ms:
            now = self.pin.value()
            if now != level:
                level = now
                start = time.ticks_ms()
        return level == 1

    def irq(self, handler, on_trigger=True):
        """Call handler(pin) when the slot becomes blocked (rising edge) or, with
        on_trigger=False, when it clears again (falling edge)."""
        trig = Pin.IRQ_RISING if on_trigger else Pin.IRQ_FALLING
        return self.pin.irq(handler=handler, trigger=trig)
