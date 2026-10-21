# Seeed Grove - Rotary Angle Sensor v1.2 (SKU 101020017), MicroPython driver.
# Circuit (Seeed schematic v1.2): a single 10 kOhm linear potentiometer (WH09-2-103).
# One end of the track goes to VCC (Grove pin 3), the other to GND (Grove pin 4), and the
# wiper goes straight to SIG (Grove pin 1). There are no other components, so
#   V(SIG) = (angle / 300 deg) * VCC        (linear taper, 300 deg mechanical travel)
#   angle(deg) = 300 * V(SIG) / VCC
# This is the same formula as Seeed's own example: degrees = voltage * FULL_ANGLE / GROVE_VCC.
# Power the module from the same 3.3 V rail as the ADC so SIG never exceeds the ADC range.
from machine import ADC, Pin


class GroveRotaryAngle:
    FULL_ANGLE = 300.0  # degrees of travel (Seeed spec)

    def __init__(self, pin, vcc=3.3, vref=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc      # voltage on the module's VCC pin
        self.vref = vref    # ADC full scale when read_uv() is not available (e.g. Pico)
        self.samples = samples

    def raw(self):
        """One 16-bit ADC reading (0-65535)."""
        return self.adc.read_u16()

    def volts(self):
        """Average several samples and return the SIG (wiper) voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def fraction(self):
        """Knob position as a fraction of travel, 0.0 (GND end) to 1.0 (VCC end)."""
        f = self.volts() / self.vcc
        return 0.0 if f < 0 else 1.0 if f > 1 else f

    def degrees(self):
        """Knob angle in degrees from the GND end of travel, 0-300."""
        return self.FULL_ANGLE * self.fraction()

    def percent(self):
        """Knob position in % of travel (0-100)."""
        return 100 * self.fraction()

    def scaled(self, lo, hi):
        """Map the position onto lo..hi (e.g. 0..65535 for PWM duty, 0..180 for a servo)."""
        return lo + (hi - lo) * self.fraction()
