# Slide potentiometer module (10 kOhm linear B103, 60 mm travel), MicroPython driver.
# The module is a passive voltage divider: the track's ends go to VCC and GND and the wiper
# goes to OTA (and, on the second gang, OTB). There are no other parts on the board, so
#   V(OTA) = position * VCC        (linear taper, position 0.0 at the GND end, 1.0 at the VCC end)
#   position(%) = 100 * V(OTA) / VCC
# Power the module from the same 3.3 V rail as the ADC, so the wiper never exceeds the ADC range.
# The carbon track has a residual (end) resistance of up to 500 ohm or 1 % (Bourns PTA datasheet),
# so the very ends of travel may read slightly above 0 % / below 100 %.
from machine import ADC, Pin


class SlidePot:
    def __init__(self, pin, vcc=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc  # voltage on the module's VCC pin
        self.samples = samples

    def volts(self):
        """Average several samples and return the wiper voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            # Pico etc.: the ADC reference is the 3.3 V rail.
            for _ in range(self.samples):
                total += self.adc.read_u16() * 3.3 / 65535
        return total / self.samples

    def fraction(self):
        """Slider position as a fraction of travel, 0.0 (GND end) to 1.0 (VCC end)."""
        f = self.volts() / self.vcc
        return 0.0 if f < 0 else 1.0 if f > 1 else f

    def percent(self):
        """Slider position in % of travel (0-100)."""
        return 100 * self.fraction()

    def scaled(self, lo, hi):
        """Map the position onto the range lo..hi (e.g. 0..255 for PWM, 0..180 for a servo)."""
        return lo + (hi - lo) * self.fraction()
