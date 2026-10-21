# DFRobot Gravity Analog Dissolved Oxygen Sensor (SEN0237 / SEN0237-A), MicroPython driver.
# The signal board (TP5551 op-amp, XC6206 3.0 V LDO) amplifies the galvanic probe's current into a
# voltage on A (0-3.0 V) proportional to dissolved oxygen. Conversion is DFRobot's own (wiki sample
# code "Example Code for Arduino-Dissolved Oxygen Measurement"):
#   V_sat = CAL1_V + 35*(T - CAL1_T)                                   single-point calibration (mV)
#   V_sat = (T - CAL2_T)*(CAL1_V - CAL2_V)/(CAL1_T - CAL2_T) + CAL2_V  two-point calibration (mV)
#   DO    = V_mV * DO_TABLE[T] / V_sat                                 ug/L (T in whole C, 0-40)
# CAL1_V / CAL2_V are the probe voltages measured in oxygen-saturated water at CAL1_T / CAL2_T.
# You MUST calibrate your own probe; the defaults (1600 mV at 25 C) are DFRobot's placeholders.
from machine import ADC, Pin

# Saturated dissolved oxygen in ug/L at 0..40 C (DFRobot DO_Table)
DO_TABLE = (
    14460, 14220, 13820, 13440, 13090, 12740, 12420, 12110, 11810, 11530,
    11260, 11010, 10770, 10530, 10300, 10080, 9860, 9660, 9460, 9270,
    9080, 8900, 8730, 8570, 8410, 8250, 8110, 7960, 7820, 7690,
    7560, 7430, 7300, 7180, 7070, 6950, 6840, 6730, 6630, 6530, 6410)


class GravityDO:
    def __init__(self, a, cal1_mv=1600, cal1_t=25, cal2_mv=None, cal2_t=None,
                 temperature=25, samples=20, vref=3.3, divider=1.0):
        """a: GPIO number (or Pin) wired to the board's A pin.
        cal1_mv/cal1_t: saturation voltage (mV) measured at cal1_t (C). Give cal2_mv/cal2_t too for
        two-point calibration (cal1 = high-temperature point, cal2 = low-temperature point).
        temperature: water temperature in C (0-40). vref: ADC full scale when read_uv() is missing."""
        self.adc = ADC(Pin(a) if isinstance(a, int) else a)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.cal1_mv = cal1_mv
        self.cal1_t = cal1_t
        self.cal2_mv = cal2_mv
        self.cal2_t = cal2_t
        self.temperature = temperature
        self.samples = samples
        self.vref = vref
        self.divider = divider

    def voltage(self):
        """Voltage on A in volts (average of several ADC samples)."""
        total = 0.0
        for _ in range(self.samples):
            if hasattr(self.adc, 'read_uv'):
                total += self.adc.read_uv() / 1e6
            else:
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def _t_index(self, t):
        t = int(round(t))
        if t < 0 or t > 40:
            raise ValueError('water temperature must be 0-40 C')
        return t

    def saturation_mv(self, t=None):
        """Probe voltage (mV) expected in 100 % saturated water at temperature t."""
        t = self._t_index(self.temperature if t is None else t)
        if self.cal2_mv is None or self.cal2_t is None:
            return self.cal1_mv + 35 * (t - self.cal1_t)
        return (t - self.cal2_t) * (self.cal1_mv - self.cal2_mv) / (self.cal1_t - self.cal2_t) + self.cal2_mv

    def do_ugl(self, v=None):
        """Dissolved oxygen in ug/L."""
        if v is None:
            v = self.voltage()
        t = self._t_index(self.temperature)
        return v * 1000.0 * DO_TABLE[t] / self.saturation_mv(t)

    def do_mgl(self, v=None):
        """Dissolved oxygen in mg/L."""
        return self.do_ugl(v) / 1000.0
