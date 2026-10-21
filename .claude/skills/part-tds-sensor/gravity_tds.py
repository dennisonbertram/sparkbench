# DFRobot Gravity Analog TDS Sensor/Meter (SEN0244), MicroPython driver.
# The signal board excites the 2-pin probe with AC and outputs a DC voltage on A (0-2.3 V) that rises
# with the water's conductivity. Conversion is DFRobot's own (GravityTDS library / wiki sample code):
#   EC   = (133.42*V^3 - 255.86*V^2 + 857.39*V) * K        (uS/cm, K = calibration factor, default 1.0)
#   EC25 = EC / (1 + 0.02*(T - 25))                          (temperature compensation to 25 C)
#   TDS  = EC25 * 0.5                                        (ppm, TDS factor 0.5)
# Range 0-1000 ppm, +/-10 % F.S. at 25 C. Not for liquids above 55 C; the probe must not be left
# powered in water for long periods (electrolysis) - power it only while measuring if you can.
from machine import ADC, Pin

TDS_FACTOR = 0.5


class GravityTDS:
    def __init__(self, a, k=1.0, temperature=25.0, samples=30, vref=3.3, divider=1.0):
        """a: GPIO number (or Pin) wired to the board's A pin. k: calibration factor (see calibrate()).
        temperature: water temperature in C for compensation (25 if you have no thermometer).
        vref: ADC full scale used when read_uv() is unavailable (e.g. Pico: 3.3)."""
        self.adc = ADC(Pin(a) if isinstance(a, int) else a)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.k = k
        self.temperature = temperature
        self.samples = samples
        self.vref = vref
        self.divider = divider

    def voltage(self):
        """Voltage on A in volts, median of several ADC samples (as DFRobot's sample code does)."""
        vals = []
        for _ in range(self.samples):
            if hasattr(self.adc, 'read_uv'):
                vals.append(self.adc.read_uv() / 1e6)
            else:
                vals.append(self.adc.read_u16() * self.vref / 65535)
        vals.sort()
        n = len(vals)
        mid = vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2
        return mid * self.divider

    @staticmethod
    def _ec_raw(v):
        return 133.42 * v * v * v - 255.86 * v * v + 857.39 * v

    def ec(self, v=None):
        """Electrical conductivity in uS/cm, compensated to 25 C."""
        if v is None:
            v = self.voltage()
        return self._ec_raw(v) * self.k / (1.0 + 0.02 * (self.temperature - 25.0))

    def tds(self, v=None):
        """Total dissolved solids in ppm (mg/L)."""
        return self.ec(v) * TDS_FACTOR

    def calibrate(self, solution_ec=1413.0):
        """Dip the probe in a buffer of known EC (default 1413 uS/cm = 707 ppm at 25 C), set
        self.temperature, then call this. Stores and returns K (DFRobot accepts 0.25-4.0)."""
        v = self.voltage()
        raw = self._ec_raw(v)
        if raw <= 0:
            raise ValueError('no signal on A: check wiring and that the probe is in the solution')
        k = solution_ec * (1.0 + 0.02 * (self.temperature - 25.0)) / raw
        if not 0.25 < k < 4.0:
            raise ValueError('K=%.2f out of range: wrong solution or bad probe' % k)
        self.k = k
        return k
