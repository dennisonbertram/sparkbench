# KY-018 photoresistor module (5 mm CdS LDR, GL55 series, in a divider with a fixed 10 kOhm
# resistor), MicroPython driver.
# Circuit (Joy-IT KY-018 documentation and code): +V -- 10 kOhm -- S -- LDR -- GND, so
#   V_S = Vcc * R_ldr / (R_ldr + 10 kOhm)   ->   R_ldr = 10 kOhm * V_S / (Vcc - V_S)
# Brighter = lower LDR resistance = LOWER voltage on S.
# Approximate illuminance from the GL55-series gamma definition (gamma = lg(R10/R100)):
#   lux ~= 10 * (R10 / R_ldr) ** (1 / gamma)
# with GL5528 values R10 = 10-20 kOhm (15 kOhm used) and gamma = 0.6. Only a rough estimate:
# the cell's R10 alone varies by a factor of 2 from part to part.
from machine import ADC, Pin


class KY018:
    R_FIXED = 10000.0  # ohms, fixed resistor from +V to S

    def __init__(self, pin, vcc=3.3, samples=32, vref=3.3, r10=15000.0, gamma=0.6):
        """pin: GPIO number (or Pin) wired to S. vcc: the voltage on the module's + pin.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico).
        r10, gamma: LDR resistance at 10 lux and gamma value, for the rough lux() estimate."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.samples = samples
        self.vref = vref
        self.r10 = r10
        self.gamma = gamma

    def voltage(self):
        """Averaged voltage on S in volts (lower = brighter)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self):
        """LDR resistance in ohms, from the divider equation (Joy-IT formula)."""
        v = self.voltage()
        if v <= 0:
            return 0.0  # S shorted to GND or extremely bright
        if v >= self.vcc:
            return float('inf')  # LDR open / not connected / total darkness
        return self.R_FIXED * v / (self.vcc - v)

    def lux(self):
        """Rough illuminance in lux (GL5528-class cell assumed; +-50 % or worse)."""
        r = self.resistance()
        if r <= 0:
            return float('inf')
        if r == float('inf'):
            return 0.0
        return 10.0 * (self.r10 / r) ** (1.0 / self.gamma)

    def brightness(self):
        """0-100 % relative brightness (100 = S at 0 V). Handy for thresholds."""
        return max(0.0, min(100.0, 100.0 * (1.0 - self.voltage() / self.vcc)))
