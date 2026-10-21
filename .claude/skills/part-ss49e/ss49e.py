# SS49E linear Hall-effect sensor (Honeywell SS39ET/SS49E/SS59ET series), MicroPython driver.
# Works for the KY-035 module (header -, +, S), which wires the sensor straight to the header.
# Datasheet (005850, Issue 4): Vs = 2.7-6.5 V; output is set by the supply voltage:
#   null (0 G) = Vs/2 (2.50 V at Vs = 5 V, 2.25-2.75 V),
#   sensitivity = 1.4 mV/G typ (1.0-1.75) at Vs = 5 V, about 0.28 mV/G per volt of supply,
# so B(G) = (Vout - Vs/2) / (0.0014 V/G x Vs/5 V). The sign shows the pole: one pole raises the
# output above null, the other lowers it (flip the magnet to see which is which).
from machine import ADC, Pin


class SS49E:
    SENS_5V = 0.0014  # V/Gauss at Vs = 5 V (typical)

    def __init__(self, pin, vcc=3.3, sensitivity=SENS_5V, samples=32, vref=3.3):
        """pin: ADC GPIO wired to S. vcc: the voltage on + (3.3 V keeps S inside a 3.3 V ADC's range)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.sens = sensitivity * vcc / 5.0  # output scales with the supply
        self.zero = vcc / 2.0  # null voltage, 0 G
        self.samples = samples
        self.vref = vref  # ADC full scale when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged output voltage (V) on S."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def calibrate_zero(self):
        """Call with no magnet nearby: stores the measured null voltage (parts vary 2.25-2.75 V at 5 V)."""
        self.zero = self.voltage()
        return self.zero

    def gauss(self):
        """Magnetic flux density in gauss (1 mT = 10 G); the sign gives the pole."""
        return (self.voltage() - self.zero) / self.sens

    def millitesla(self):
        return self.gauss() / 10.0
