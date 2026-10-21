# Sharp GP2Y0A02YK0F infrared distance sensor (20-150 cm, analog output), MicroPython driver.
# The sensor measures by triangulation and puts out a voltage on Vo that FALLS as the object
# gets farther away. The datasheet gives no formula, only Fig. 2 "Example of distance measuring
# characteristics (output)" (Vcc = 5 V, white paper 90 % reflectance), whose lower plot shows Vo
# is roughly linear in 1/L over the range. This driver interpolates linearly in 1/L between the
# typical points read off that figure.
# A new measurement is made every 38.3 ms +/- 9.6 ms (datasheet Fig. 1; output settles within 5 ms
# of each measurement), so averaging several ADC samples over a few ms smooths supply ripple.
# Below 20 cm the output keeps rising to a peak (~2.75 V at 15 cm) and then falls again towards
# 0 V, so a high voltage is ambiguous: readings above the 20 cm level are reported as None (too
# close), readings below the 150 cm level as None (nothing in range).
import time
from machine import ADC, Pin

# (distance in cm, typical Vo in volts) from datasheet Fig. 2, far to near
CURVE = (
    (150, 0.44), (140, 0.47), (130, 0.50), (120, 0.55), (110, 0.59),
    (100, 0.66), (90, 0.72), (80, 0.82), (70, 0.90), (60, 1.05),
    (50, 1.24), (40, 1.53), (30, 1.99), (20, 2.53),
)


class GP2Y0A02YK:
    def __init__(self, pin, samples=16, vref=3.3):
        """pin: GPIO number (or Pin) wired to Vo. vref: ADC full scale in volts, used when
        read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """Averaged Vo in volts."""
        total = 0
        for _ in range(self.samples):
            if hasattr(self.adc, 'read_uv'):
                total += self.adc.read_uv() / 1e6
            else:
                total += self.adc.read_u16() * self.vref / 65535
            time.sleep_us(200)
        return total / self.samples

    @staticmethod
    def volts_to_cm(v):
        """Distance in cm for an output voltage, or None outside the 20-150 cm range."""
        if v < CURVE[0][1] or v > CURVE[-1][1]:
            return None
        for (d1, v1), (d2, v2) in zip(CURVE, CURVE[1:]):
            if v1 <= v <= v2:
                # linear in inverse distance between the two datasheet points
                inv = 1 / d1 + (v - v1) * (1 / d2 - 1 / d1) / (v2 - v1)
                return 1 / inv
        return None

    def distance_cm(self):
        """Distance to the object in cm (20-150), or None when nothing is in range / too close."""
        return self.volts_to_cm(self.voltage())
