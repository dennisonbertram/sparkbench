# SparkFun Current Sensor Breakout - ACS723 (Low Current), SEN-14544, MicroPython driver.
# Chip: Allegro ACS723LLCTR-05AB-T (+/-5 A, bidirectional). Datasheet: VCC = 4.5-5.5 V,
#   VIOUT = VCC x 0.5 + 0.400 V/A x I at VCC = 5 V (ratiometric), positive slope for
#   current flowing IP+ -> IP-.
# The board follows the chip with an OPA344 INVERTING amplifier (SparkFun schematic v10):
#   VO = Vref + G x (Vref - VIOUT),  G = 22k / (1k + VR1) = 2 ... 22 (GAIN trimmer),
#   Vref = VREF trimmer wiper (0 ... VCC).
# So VO falls as current IP+ -> IP- rises, and both the zero point and the slope depend on
# the two trimmers. Measure them once (calibrate_zero / calibrate_sensitivity) and pass them in.
# Defaults = GAIN trimmer at minimum (G = 2) and VREF wiper at VCC/2:
#   zero = 2.5 V, sensitivity = -2 x 0.400 = -0.800 V/A.
from machine import ADC, Pin


class ACS723LC:
    CHIP_SENS = 0.400  # V/A at VCC = 5 V, ACS723LLCTR-05AB

    def __init__(self, pin, zero=2.5, sensitivity=-0.8, divider=1.0, samples=64, vref=3.3):
        """pin: ADC GPIO wired to VO. zero: VO (V) with no current flowing.
        sensitivity: change of VO per amp IP+ -> IP- (V/A, negative on this board).
        divider: VO / Vadc if a resistor divider sits between VO and the ADC pin."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.zero = zero
        self.sens = sensitivity
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged VO voltage (V)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with NO current flowing: stores the measured zero-current VO."""
        self.zero = self.voltage()
        return self.zero

    def calibrate_sensitivity(self, known_amps):
        """Call with a known current (A, IP+ -> IP-) flowing, after calibrate_zero()."""
        self.sens = (self.voltage() - self.zero) / known_amps
        return self.sens

    def gain(self):
        """Amplifier gain implied by the sensitivity (VCC = 5 V)."""
        return -self.sens / self.CHIP_SENS

    def current(self):
        """Current in amperes (positive = IP+ to IP-)."""
        return (self.voltage() - self.zero) / self.sens
