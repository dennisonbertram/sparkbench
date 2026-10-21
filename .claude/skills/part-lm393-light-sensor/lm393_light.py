# LM393 light sensor module (LDR + LM393 comparator, 3-pin VCC/GND/DO), MicroPython driver.
# The photoresistor (LDR) and a fixed resistor form a divider; one half of the LM393
# (TI datasheet: open-collector output) compares it with the blue trimmer voltage.
# The board pulls DO up to VCC, so on the common module DO is:
#   LOW  (0) when the light is brighter than the trimmer threshold (DO-LED lit)
#   HIGH (1) when it is darker than the threshold (DO-LED off)
# Some sellers' boards are the other way round: pass active_low=False for those.
# DO is only a yes/no threshold: it does not measure lux.
# Power the module from 3.3 V when using a 3.3 V board, because DO is pulled up to VCC.
from machine import Pin


class LM393Light:
    def __init__(self, pin, active_low=True):
        """pin: GPIO number (or Pin) wired to DO.
        active_low: True (common board) if DO goes LOW in bright light."""
        # The module has its own pull-up on DO; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self.active_low = active_low

    def raw(self):
        """Logic level on DO right now (0 or 1)."""
        return self.pin.value()

    def bright(self):
        """True when the light is past the trimmer threshold."""
        return self.pin.value() == (0 if self.active_low else 1)

    def dark(self):
        """True when the light is below the trimmer threshold."""
        return not self.bright()
