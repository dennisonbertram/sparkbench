# ACS712 Hall-effect current sensor (Allegro MicroSystems), MicroPython driver.
# For the ACS712ELCTR-05B (+/-5 A) on the common 3-pin VCC/OUT/GND module.
# Datasheet (ACS712, rev. 15): VCC = 4.5-5.5 V, output is ratiometric to VCC:
#   VIOUT(Q) = VCC x 0.5 at 0 A, Sens = 185 mV/A (180-190) at VCC = 5 V,
# so I(A) = (Vout - VCC/2) / (0.185 V/A x VCC/5 V).
# Positive current flows into IP+ (screw terminal pins 1-2) and out of IP- (pins 3-4).
from machine import ADC, Pin


class ACS712:
    SENS_05B = 0.185  # V/A at VCC = 5 V (x05B)
    SENS_20A = 0.100  # V/A at VCC = 5 V (x20A)
    SENS_30A = 0.066  # V/A at VCC = 5 V (x30A)

    def __init__(self, pin, vcc=5.0, sensitivity=SENS_05B, divider=1.0, samples=64, vref=3.3):
        """pin: ADC GPIO wired to OUT. vcc: the module's supply voltage (ratiometric).
        divider: Vout / Vadc, e.g. 1.5 for a 10k (top) / 20k (bottom) divider; 1.0 if wired directly."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.sens = sensitivity * vcc / 5.0  # sensitivity scales with VCC (ratiometric)
        self.zero = vcc / 2.0  # VIOUT(Q) = VCC x 0.5
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged sensor output voltage (V) at the OUT pin."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with NO current flowing: stores the measured 0 A output instead of VCC/2."""
        self.zero = self.voltage()
        return self.zero

    def current(self):
        """Current in amperes (positive = IP+ to IP-)."""
        return (self.voltage() - self.zero) / self.sens
