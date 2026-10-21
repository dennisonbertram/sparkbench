# DFRobot Gravity Analog Electrical Conductivity Sensor/Meter V2 (K=1), SKU DFR0300. MicroPython driver.
# The signal conditioner board drives the K=1 probe (BNC) with AC excitation and outputs a filtered DC
# voltage on A (0-3.4 V) proportional to the water's conductivity. Conversion is DFRobot's own
# (DFRobot_EC library, RES2 = 820, ECREF = 200, V in mV):
#   rawEC = 1000 * V_mV / 820 / 200                 (ms/cm, before calibration)
#   EC    = rawEC * K                               (K from two-point calibration, default 1.0)
#   EC25  = EC / (1 + 0.0185 * (T - 25))            (temperature compensation to 25 C)
# Two K values: K_low (calibrated in 1413 uS/cm buffer) is used below 2.0 ms/cm, K_high (12.88 ms/cm
# buffer) above 2.5 ms/cm, with hysteresis in between, exactly like the library's automatic range shift.
# Supported range 0-20 ms/cm (1-15 ms/cm recommended), probe 0-40 C, +/-5 % F.S.
from machine import ADC, Pin

RES2 = 820.0
ECREF = 200.0
TEMP_COEF = 0.0185


class GravityEC:
    def __init__(self, a, k_low=1.0, k_high=1.0, temperature=25.0, samples=30, vref=3.3, divider=1.0):
        """a: GPIO number (or Pin) wired to the board's A pin. k_low/k_high: calibration factors
        (see calibrate()). temperature: water temperature in C for compensation.
        vref: ADC full scale used when read_uv() is unavailable (e.g. Pico: 3.3).
        divider: (top + bottom) / bottom if you put a resistor divider between A and the ADC."""
        self.adc = ADC(Pin(a) if isinstance(a, int) else a)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: widest input range; other ports have no atten()
        except AttributeError:
            pass
        self.k_low = k_low
        self.k_high = k_high
        self.k = k_low
        self.temperature = temperature
        self.samples = samples
        self.vref = vref
        self.divider = divider

    def voltage(self):
        """Voltage on A in volts, median of several ADC samples."""
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
    def raw_ec(v):
        """Uncalibrated conductivity in ms/cm for a voltage v (volts) on A."""
        return 1000.0 * (v * 1000.0) / RES2 / ECREF

    def ec(self, v=None, temperature=None):
        """Conductivity in ms/cm, calibrated and compensated to 25 C."""
        if v is None:
            v = self.voltage()
        if temperature is None:
            temperature = self.temperature
        raw = self.raw_ec(v)
        # automatic range shift (library: first range 0-2, second range 2-20 ms/cm)
        tmp = raw * self.k
        if tmp > 2.5:
            self.k = self.k_high
        elif tmp < 2.0:
            self.k = self.k_low
        return raw * self.k / (1.0 + TEMP_COEF * (temperature - 25.0))

    def calibrate(self, temperature=None):
        """Put the probe in 1413 uS/cm or 12.88 ms/cm buffer, then call this. The buffer is recognised
        from the reading (as the DFRobot library does); the matching K is stored and returned."""
        if temperature is None:
            temperature = self.temperature
        v = self.voltage()
        raw = self.raw_ec(v)
        if 0.9 < raw < 1.9:
            sol, high = 1.413, False
        elif 9.0 < raw < 16.8:
            sol, high = 12.88, True
        else:
            raise ValueError('buffer solution not recognised (raw %.2f ms/cm)' % raw)
        comp = sol * (1.0 + TEMP_COEF * (temperature - 25.0))
        k = RES2 * ECREF * comp / 1000.0 / (v * 1000.0)
        if not 0.5 < k < 1.5:
            raise ValueError('K=%.2f out of range 0.5-1.5: try again with fresh buffer' % k)
        if high:
            self.k_high = k
        else:
            self.k_low = k
        return k
