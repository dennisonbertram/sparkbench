# Adafruit anemometer wind speed sensor (product 1733, QS-FS analog voltage type), MicroPython driver.
# Supply 7-24 V DC on the brown wire (NOT from the 3.3 V / 5 V pins). The blue signal wire is linear:
# 0.4 V at 0 m/s up to 2.0 V at 32.4 m/s (Adafruit product page; QS-FS datasheet range 0-32.4 m/s),
# i.e. wind (m/s) = (V - 0.4) * 32.4 / 1.6 = (V - 0.4) * 20.25.
from machine import ADC, Pin


class Anemometer:
    V_ZERO = 0.4       # output at 0 m/s
    V_FULL = 2.0       # output at full scale
    FULL_MS = 32.4     # full-scale wind speed in m/s

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Average several ADC samples and return the signal voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def speed(self, v=None):
        """Wind speed in m/s (0.4 V = 0 m/s, 2.0 V = 32.4 m/s). Readings below 0.4 V count as calm."""
        if v is None:
            v = self.voltage()
        ms = (v - self.V_ZERO) * self.FULL_MS / (self.V_FULL - self.V_ZERO)
        return ms if ms > 0 else 0.0

    def speed_kmh(self):
        return self.speed() * 3.6
