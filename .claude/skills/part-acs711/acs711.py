# Pololu ACS711EX Current Sensor Carrier -15.5A to +15.5A (#2452), MicroPython driver.
# Chip: Allegro ACS711KEXLT-15AB-T (datasheet rev. 4+):
#   VCC = 3.0-5.5 V; device is factory-trimmed at VCC = 3.3 V.
#   VIOUT(Q) = VCC x 0.5 at 0 A; Sens = 90 mV/A at VCC = 3.3 V (x15AB, EX package).
#   Output is ratiometric: zero point and sensitivity scale with VCC (136 mV/A at 5 V).
#   I(A) = (Vout - VCC/2) / (0.090 V/A x VCC / 3.3 V)
#   Positive current flows IP+ -> IP- (the +i arrow on the board's silkscreen).
#   FAULT (open drain, 10 k pull-up to VCC on the carrier) latches LOW when |I| > 15.5 A;
#   only a VCC power cycle (VCC < 200 mV for > 100 us) clears it.
from machine import ADC, Pin


class ACS711:
    SENS_15AB = 0.090  # V/A at VCC = 3.3 V (ACS711KEXLT-15AB, +/-15.5 A)
    SENS_31AB = 0.045  # V/A at VCC = 3.3 V (ACS711KEXLT-31AB, +/-31 A)

    def __init__(self, pin, vcc=3.3, sensitivity=SENS_15AB, fault_pin=None,
                 divider=1.0, samples=64, vref=3.3):
        """pin: ADC GPIO wired to OUT. vcc: the carrier's supply voltage (ratiometric).
        fault_pin: optional GPIO wired to FAULT. divider: Vout / Vadc if a divider is used
        (needed when VCC = 5 V and the ADC is 3.3 V)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.sens = sensitivity * vcc / 3.3  # ratiometric sensitivity
        self.zero = vcc / 2.0  # VIOUT(Q) = VCC x 0.5
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.fault_pin = None
        if fault_pin is not None:
            self.fault_pin = Pin(fault_pin, Pin.IN) if isinstance(fault_pin, int) else fault_pin

    def voltage(self):
        """Averaged OUT voltage (V)."""
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

    def fault(self):
        """True if the overcurrent FAULT latch has tripped (FAULT pin low)."""
        if self.fault_pin is None:
            return False
        return self.fault_pin.value() == 0
