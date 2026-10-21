# GA1A12S202 log-scale analog light sensor (Adafruit #1384, Sharp GA1A1S202WP), MicroPython driver.
# The Sharp GA1A1S202WP is a photodiode + current amp + LOG AMP that sources an output current
# proportional to the logarithm of illuminance. Datasheet (Nov 2007) section 3.3, note *2:
#     Io = 10 x log10(Ev)  [uA]     (typ: 20 uA at 100 lx, 30 uA at 1000 lx; range 3..55000 lx)
# The Adafruit breakout puts a 68 kOhm resistor from OUT to GND, so
#     V(OUT) = Io x 68 kOhm = 0.68 V x log10(Ev)   ->   Ev = 10 ** (V / 0.68)
# i.e. 0.68 V per decade of light: 10 lx = 0.68 V, 100 lx = 1.36 V, 1000 lx = 2.04 V, 10000 lx = 2.72 V.
from machine import ADC, Pin


class GA1A12S202:
    LOAD_OHMS = 68000.0  # Adafruit breakout load resistor, OUT to GND
    UA_PER_DECADE = 10.0  # datasheet: Io = 10 x log10(Ev) uA

    def __init__(self, pin, samples=16, vref=3.3, load_ohms=LOAD_OHMS):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.load_ohms = load_ohms

    def volts(self):
        """Average several ADC samples and return the OUT voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def microamps(self):
        """Output current Io in uA (voltage across the 68 kOhm load)."""
        return self.volts() / self.load_ohms * 1000000

    def log_lux(self):
        """log10 of the illuminance: Io / 10 uA (datasheet Io = 10 x log10(Ev) uA)."""
        return self.microamps() / self.UA_PER_DECADE

    def lux(self):
        """Illuminance in lux: Ev = 10 ** (Io / 10 uA) = 10 ** (V / 0.68 V)."""
        return 10 ** self.log_lux()
