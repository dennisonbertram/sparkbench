# MPX5010DP differential pressure sensor (NXP / Freescale), MicroPython driver.
# Datasheet MPX5010 Rev 13: VS = 4.75-5.25 V (ratiometric), 0-10 kPa, output 0.2-4.7 V at VS = 5 V.
# Nominal transfer function: Vout = VS x (0.09 x P + 0.04), P in kPa (P1 > P2)
#   =>  P (kPa) = (Vout / VS - 0.04) / 0.09
# Unibody case 867C pins: 1 VOUT, 2 GND, 3 VCC (VS), 4-6 no connect.
# Vout reaches 4.7 V: on a 3.3 V board use a divider (e.g. 10k OUT->ADC, 20k ADC->GND, divider=1.5).
from machine import ADC, Pin


class MPX5010:
    def __init__(self, pin, vs=5.0, divider=1.0, samples=32, vref=3.3):
        """pin: ADC GPIO wired to VOUT (through the divider if you use one).
        vs: the sensor's supply voltage (output is ratiometric to it).
        divider: Vout / Vadc, e.g. 1.5 for 10k (top) / 20k (bottom); 1.0 when wired directly."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.vs = vs
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale when read_uv() is not available (e.g. Pico)
        self.offset = 0.04  # Vout / VS at 0 kPa (datasheet nominal: 0.2 V at 5 V)

    def voltage(self):
        """Averaged sensor output voltage (V) at VOUT."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with both ports open to air (0 kPa): stores the real offset (0 to 0.425 V per datasheet)."""
        self.offset = self.voltage() / self.vs
        return self.offset * self.vs

    def pressure_kpa(self):
        """Differential pressure P1 - P2 in kPa (datasheet transfer function)."""
        return (self.voltage() / self.vs - self.offset) / 0.09

    def pressure_mmh2o(self):
        """Pressure in mm of water (1 kPa = 101.97 mmH2O)."""
        return self.pressure_kpa() * 101.97
