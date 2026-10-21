# M5Stack Unit Dual Button (U025), MicroPython driver.
# Per the M5Stack schematic (Sch_UNIT_DualButton_v1.1) each button S1/S2 shorts its signal
# line to GND. At rest the line sits on a 10 kOhm (to Grove VCC) / 20 kOhm (to GND)
# divider with a 100 nF filter capacitor, so from the 5 V Grove supply:
#   released -> about 3.3 V (5 V x 20k / 30k), logic 1
#   pressed  -> 0 V, logic 0 (active low)
# Grove pin 1 (white) = BLUE button (net A), pin 2 (yellow) = RED button (net B).
# Power the unit from 5 V: from 3.3 V the released level is only ~2.2 V, below a
# 3.3 V MCU's guaranteed logic-high threshold. No GPIO pull resistor is needed.
from machine import Pin
import time


class _Button:
    def __init__(self, pin, debounce_ms):
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on the line right now (1 released, 0 pressed)."""
        return self.pin.value()

    def is_down(self):
        """Undebounced: True while the button is held."""
        return self.pin.value() == 0

    def pressed(self):
        """Debounced: True if the button is held and stable for debounce_ms."""
        state = self.pin.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            v = self.pin.value()
            if v != state:
                state = v
                t0 = time.ticks_ms()
            time.sleep_ms(2)
        return state == 0

    def irq(self, handler, on_press=True):
        """Call handler(pin) on press (falling edge) or release (rising edge)."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_press else Pin.IRQ_RISING)


class M5DualButton:
    def __init__(self, blue_pin, red_pin, debounce_ms=20):
        self.blue = _Button(blue_pin, debounce_ms)
        self.red = _Button(red_pin, debounce_ms)

    def read(self):
        """Debounced (blue, red) states: 1 = pressed, 0 = released."""
        return int(self.blue.pressed()), int(self.red.pressed())
