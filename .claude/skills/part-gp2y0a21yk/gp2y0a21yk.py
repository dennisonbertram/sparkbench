# Sharp GP2Y0A21YK0F infrared distance sensor (10-80 cm, analog output), MicroPython driver.
# The sensor measures by triangulation and puts out a voltage on Vo that FALLS as the object
# gets farther away. The datasheet gives no formula, only Fig. 2 "Example of distance measuring
# characteristics" (Vcc = 5 V, white paper 90 % reflectance), whose output is roughly linear in
# 1/L. This driver interpolates linearly in 1/L between the typical points read off that figure.
# A new measurement is made every 38.3 ms +/- 9.6 ms (datasheet Fig. 1), so averaging several ADC
# samples over a few ms smooths the small steps and supply ripple without hiding motion.
# Below 10 cm the output falls again (peak ~3.1 V at about 6 cm), so a high voltage is ambiguous:
# readings above the 10 cm level are reported as None (too close), below the 80 cm level as None.
import time
from machine import ADC, Pin

# (distance in cm, typical Vo in volts) from datasheet Fig. 2, far to near
CURVE = (
    (80, 0.40), (70, 0.44), (60, 0.51), (50, 0.60), (40, 0.74),
    (30, 0.92), (25, 1.08), (20, 1.31), (15, 1.64), (10, 2.32),
)


class GP2Y0A21YK:
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
        """Distance in cm for an output voltage, or None outside the 10-80 cm range."""
        if v < CURVE[0][1] or v > CURVE[-1][1]:
            return None
        for (d1, v1), (d2, v2) in zip(CURVE, CURVE[1:]):
            if v1 <= v <= v2:
                # linear in inverse distance between the two datasheet points
                inv = 1 / d1 + (v - v1) * (1 / d2 - 1 / d1) / (v2 - v1)
                return 1 / inv
        return None

    def distance_cm(self):
        """Distance to the object in cm (10-80), or None when nothing is in range / too close."""
        return self.volts_to_cm(self.voltage())
