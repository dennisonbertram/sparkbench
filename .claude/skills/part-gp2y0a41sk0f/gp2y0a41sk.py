# Sharp GP2Y0A41SK0F infrared distance sensor (4-30 cm, analog output), MicroPython driver.
# The sensor measures by triangulation and puts out a voltage on Vo that FALLS as the object
# gets farther away. The datasheet gives no formula, only "Example of output distance
# characteristics" (Vcc = 5 V, white paper 90 % reflectance) and the same data plotted against
# 1/(L + 0.42), where Sharp shows the output is close to a straight line. This driver therefore
# interpolates linearly in 1/(L + 0.42) between the typical points read off that figure.
# A new measurement is made every 16.5 ms +/- 3.7 ms (datasheet timing chart; the first valid
# output appears at most 5 ms after the first measurement), so averaging several ADC samples
# over a few ms smooths the steps and supply ripple without hiding motion.
# Below 4 cm the output falls again (peak ~3.05 V at about 3 cm), so a high voltage is ambiguous:
# readings above the 4 cm level are reported as None (too close), below the 30 cm level as None.
import time
from machine import ADC, Pin

# (distance in cm, typical Vo in volts) from the datasheet figure (white paper), far to near
CURVE = (
    (30, 0.43), (25, 0.53), (20, 0.66), (18, 0.73), (16, 0.81), (14, 0.93),
    (12, 1.06), (10, 1.27), (9, 1.39), (8, 1.56), (7, 1.77), (6, 2.02),
    (5, 2.34), (4, 2.72),
)
L_OFFSET = 0.42  # cm, from the datasheet's linearising axis 1/(L + 0.42)


class GP2Y0A41SK:
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
        """Distance in cm for an output voltage, or None outside the 4-30 cm range."""
        if v < CURVE[0][1] or v > CURVE[-1][1]:
            return None
        for (d1, v1), (d2, v2) in zip(CURVE, CURVE[1:]):
            if v1 <= v <= v2:
                # linear in 1/(L + 0.42) between the two datasheet points
                x1 = 1 / (d1 + L_OFFSET)
                x2 = 1 / (d2 + L_OFFSET)
                x = x1 + (v - v1) * (x2 - x1) / (v2 - v1)
                return 1 / x - L_OFFSET
        return None

    def distance_cm(self):
        """Distance to the object in cm (4-30), or None when nothing is in range / too close."""
        return self.volts_to_cm(self.voltage())
