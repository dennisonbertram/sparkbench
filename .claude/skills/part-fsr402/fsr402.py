# Interlink FSR 402 force sensing resistor, MicroPython driver.
# Wiring (FSR 400 Series datasheet, "simple force-to-voltage conversion"): one FSR lead to V+
# (3.3 V), the other lead to an ADC pin and through a measuring resistor RM (10 kOhm) to GND.
#   VOUT = RM * V+ / (RM + RFSR)     ->     RFSR = RM * (V+ - VOUT) / VOUT
# VOUT rises with force. Untouched the FSR is > 10 MOhm, so VOUT is only a few mV.
# force_g() is a rough estimate from the datasheet's typical force-vs-resistance graph
# (about 16 kOhm at 100 g, 10 kOhm at 170 g, 2.7 kOhm at 1 kg, 1.5 kOhm at 2 kg):
#   RFSR ~= 10 kOhm * (F / 170 g) ** -0.8   ->   F ~= 170 g * (10 kOhm / RFSR) ** 1.25
# Interlink: +/-6 % part to part, +10 % hysteresis, and values depend on the actuation
# mechanics. It is a touch/squeeze sensor, not a scale.
from machine import ADC, Pin


class FSR402:
    def __init__(self, pin, rm=10000, vplus=3.3, vref=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V input range
        except AttributeError:
            pass
        self.rm = rm          # measuring resistor from the ADC pin to GND (ohms)
        self.vplus = vplus    # voltage on the other FSR lead
        self.vref = vref      # ADC full scale for read_u16() (Pico: 3.3 V)
        self.samples = samples

    def volts(self):
        """Average several ADC samples and return VOUT in volts."""
        total = 0
        for _ in range(self.samples):
            total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self, v=None):
        """FSR resistance in ohms, or None when not pressed (VOUT < 10 mV, i.e. > ~3 MOhm)."""
        if v is None:
            v = self.volts()
        if v < 0.01:
            return None
        if v >= self.vplus:
            return 0.0
        return self.rm * (self.vplus - v) / v

    def pressed(self, threshold_v=0.3):
        """True when VOUT is above threshold_v (about 100 kOhm with RM = 10 kOhm: a light touch)."""
        return self.volts() > threshold_v

    def force_g(self, r=None):
        """Rough force in grams from the datasheet's typical curve (0 when not pressed).
        Only meaningful over about 20 g - 2 kg (0.2-20 N)."""
        if r is None:
            r = self.resistance()
        if r is None:
            return 0
        if r <= 0:
            return 2000
        return 170 * (10000 / r) ** 1.25
