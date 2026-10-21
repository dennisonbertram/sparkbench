# Seeed Grove - Slide Potentiometer (SKU 101020036), MicroPython driver.
# Circuit (Seeed schematic "Sliding_protentiometer_sch"): a 10 kOhm linear (B taper) slide
# potentiometer R1 with its track ends on GND (R1 pin 1) and VCC (R1 pin 3); the wiper goes
# straight to Grove pin 1 (OUT). Grove pin 2 (LED) drives an on-board green LED through a
# series resistor R2 to GND: drive it high to light the LED. No buffer, no other parts, so
#   V(OUT)      = position * VCC          (0 at the GND end of travel, VCC at the VCC end)
#   position(%) = 100 * V(OUT) / VCC
# Power the module from the same 3.3 V rail as the ADC so OUT never exceeds the ADC range.
# Track tolerance +/-20 %; residual resistance up to 20 ohm at the ends (S3033N spec), so the
# ends of travel read within a fraction of a percent of 0 % / 100 %.
from machine import ADC, Pin


class GroveSlidePot:
    def __init__(self, pin, led=None, vcc=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.led_pin = None
        if led is not None:
            self.led_pin = Pin(led, Pin.OUT, value=0)
        self.vcc = vcc  # voltage on the module's VCC pin
        self.samples = samples

    def volts(self):
        """Average several samples and return the wiper (OUT) voltage in volts."""
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
        """Slider position in % of the 30 mm travel (0-100)."""
        return 100 * self.fraction()

    def scaled(self, lo, hi):
        """Map the position onto lo..hi (e.g. 0..255 for PWM, 0..180 for a servo)."""
        return lo + (hi - lo) * self.fraction()

    def led(self, on):
        """Switch the on-board green LED (Grove pin 2) on or off; needs led= in the constructor."""
        if self.led_pin is not None:
            self.led_pin.value(1 if on else 0)
