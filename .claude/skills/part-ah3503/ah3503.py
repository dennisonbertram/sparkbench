# AH3503 linear Hall-effect sensor (Nanjing AH Electronics), MicroPython driver.
# Datasheet (AH3503 series): Vcc 4.5-6 V, Icc 9 mA typ; at Ta = 25 C:
#   quiescent output (B = 0)   Vout = 2.5 V typ (2.25-2.75 V)
#   sensitivity                S = 13.5 mV/mT typ (7.5-17.5 mV/mT), linear over -90..+90 mT
#   output resistance          50 ohm (emitter follower)
# so B(mT) = (Vout - Vq) / 0.0135 V/mT (1 mT = 10 G). One pole raises Vout, the other lowers it.
# At +90 mT Vout is about 3.7 V, above a 3.3 V ADC pin: feed it through a divider
# (e.g. 10k from OUT to the ADC pin, 20k from the ADC pin to GND) and pass divider=1.5.
from machine import ADC, Pin


class AH3503:
    SENS = 0.0135   # V/mT, typical
    VQ = 2.5        # V at B = 0, typical

    def __init__(self, pin, divider=1.0, sensitivity=SENS, zero=VQ, samples=64, vref=3.3):
        """pin: ADC GPIO wired to OUT. divider: Vout / Vadc (1.5 for a 10k top / 20k bottom divider)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.divider = divider
        self.sens = sensitivity
        self.zero = zero
        self.samples = samples
        self.vref = vref  # ADC full scale when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged sensor output voltage (V) at the OUT pin (divider undone)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with no magnet nearby: stores the measured B = 0 output (parts vary 2.25-2.75 V)."""
        self.zero = self.voltage()
        return self.zero

    def millitesla(self):
        """Magnetic flux density in mT; the sign gives the pole."""
        return (self.voltage() - self.zero) / self.sens

    def gauss(self):
        return self.millitesla() * 10.0
