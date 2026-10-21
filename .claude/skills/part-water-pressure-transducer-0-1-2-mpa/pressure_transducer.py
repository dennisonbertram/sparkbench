# G1/4" 0-1.2 MPa water pressure transducer (Seeed Studio 114991178 and identical clones), MicroPython driver.
# Specification (Seeed "Water Pressure Sensor G1/4 1.2MPa"): supply DC 5 +/- 0.5 V, <= 10 mA,
# output DC 0.5-4.5 V linear over 0-1.2 MPa, accuracy +/-1.5 %FS, response <= 2 ms.
# The output is ratiometric to the supply:
#   Vout = VS x (0.1 + 0.8 x P / 1.2)      (0.5 V at 0 MPa, 4.5 V at 1.2 MPa with VS = 5 V)
#   =>  P (MPa) = (Vout / VS - 0.1) x 1.2 / 0.8
# Leads: red +5 V, black GND, yellow signal.
# Vout reaches 4.5 V: on a 3.3 V board feed the ADC through a divider (e.g. 33k OUT->ADC, 68k ADC->GND).
from machine import ADC, Pin


class PressureTransducer:
    def __init__(self, pin, full_scale_mpa=1.2, vs=5.0, divider=1.0, samples=32, vref=3.3):
        """pin: ADC GPIO wired to the yellow lead (through the divider if used).
        full_scale_mpa: rated range (1.2 for this sensor).
        vs: the sensor's supply voltage (output is ratiometric to it).
        divider: Vout / Vadc, e.g. 101/68 for 33k (top) / 68k (bottom); 1.0 when wired directly."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.fs = full_scale_mpa
        self.vs = vs
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale when read_uv() is not available (e.g. Pico)
        self.offset = 0.1  # Vout / VS at 0 MPa (0.5 V at 5 V)

    def voltage(self):
        """Averaged transducer output voltage (V) on the yellow lead."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with the port open to air (0 MPa gauge): stores the real zero offset."""
        self.offset = self.voltage() / self.vs
        return self.offset * self.vs

    def pressure_mpa(self):
        """Gauge pressure in MPa (linear 0.5-4.5 V over 0-full scale)."""
        return (self.voltage() / self.vs - self.offset) * self.fs / 0.8

    def pressure_bar(self):
        return self.pressure_mpa() * 10

    def pressure_psi(self):
        return self.pressure_mpa() * 145.038
