# ACS758 Hall-effect current sensor (Allegro MicroSystems), MicroPython driver.
# For the ACS758LCB-050B (+/-50 A) on the purple CJMCU-758 / MCU-758 module (header VCC, GND, OU1, OU2).
# Datasheet (ACS758xCB): VCC 3.0-5.5 V, factory-trimmed at VCC = 5 V, output ratiometric to VCC:
#   VIOUT(Q) = VCC / 2 at 0 A (bidirectional "B" parts), Sens = 40 mV/A (x050B) at VCC = 5 V,
# so I(A) = (Vout - VCC/2) / (0.040 V/A x VCC/5 V).
# Unidirectional "U" parts instead sit at VIOUT(QUNI) = 0.6 V (x VCC/5) at 0 A: pass zero_frac=0.12.
# Positive current flows into IP+ and out of IP-.
from machine import ADC, Pin


class ACS758:
    SENS_050B = 0.040   # V/A at VCC = 5 V
    SENS_050U = 0.060
    SENS_100B = 0.020
    SENS_100U = 0.040
    SENS_150B = 0.0133
    SENS_150U = 0.0267
    SENS_200B = 0.010
    SENS_200U = 0.020

    def __init__(self, pin, vcc=5.0, sensitivity=SENS_050B, zero_frac=0.5, divider=1.0, samples=64, vref=3.3):
        """pin: ADC GPIO wired to OU1. vcc: the module's supply voltage (ratiometric).
        zero_frac: 0 A output as a fraction of VCC (0.5 bidirectional, 0.12 unidirectional).
        divider: Vout / Vadc, e.g. 1.5 for a 10k (top) / 20k (bottom) divider; 1.0 if wired directly."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.sens = sensitivity * vcc / 5.0  # sensitivity scales with VCC (ratiometric)
        self.zero = vcc * zero_frac          # VIOUT(Q) scales with VCC too
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged sensor output voltage (V) at the OU1 pin."""
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
