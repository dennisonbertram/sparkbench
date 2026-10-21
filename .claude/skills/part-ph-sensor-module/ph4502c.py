# PH-4502C analog pH sensor module (with E-201-C style BNC glass-electrode probe), MicroPython driver.
# The board buffers and amplifies the probe's tiny voltage (about 59 mV per pH at 25 C, Nernst) and shifts
# it so that Po sits near 2.5 V at pH 7 once POT1 ("analog reading offset", the trimmer nearest the BNC
# socket) is set: short the BNC centre to its shell (or use pH 7 buffer) and turn POT1 until Po = 2.50 V.
# Po RISES as the liquid gets more acidic (lower pH) and falls as it gets more alkaline:
#     pH = 7 + (V_neutral - V_po) / slope        slope typically about 0.18 V per pH at 25 C
# The slope depends on the probe and the board, so calibrate with two buffers (pH 4.00 / 6.86 / 9.18 ...)
# using calibrate_two_point() for real measurements. The Nernst slope scales with absolute temperature, so
# pass the liquid temperature for compensation if you know it.
from machine import ADC, Pin


class PH4502C:
    def __init__(self, po, neutral_v=2.5, slope=0.18, samples=20, vref=3.3, divider=1.0, cal_temp=25.0):
        """po: GPIO number (or Pin) wired to the board's Po pin.
        neutral_v: Po voltage at pH 7 (2.5 V after setting POT1). slope: volts per pH unit at cal_temp.
        divider: Po voltage / ADC-pin voltage if you fitted a resistor divider (Po can exceed 3.3 V below ~pH 2.3).
        vref: ADC full scale used when read_uv() is unavailable (e.g. Pico: 3.3)."""
        self.adc = ADC(Pin(po) if isinstance(po, int) else po)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.neutral_v = neutral_v
        self.slope = slope
        self.cal_temp = cal_temp
        self.samples = samples
        self.vref = vref
        self.divider = divider

    def voltage(self):
        """Po voltage in volts: median of several ADC samples (the probe signal is noisy)."""
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

    def ph(self, v=None, temperature=None):
        """pH from the Po voltage. temperature (C) scales the slope by absolute temperature (Nernst)."""
        if v is None:
            v = self.voltage()
        s = self.slope
        if temperature is not None:
            s = s * (temperature + 273.15) / (self.cal_temp + 273.15)
        return 7.0 + (self.neutral_v - v) / s

    def calibrate_two_point(self, ph1, v1, ph2, v2, temperature=25.0):
        """Set neutral_v and slope from two buffers: measure Po (voltage()) in buffer ph1, rinse, then in ph2.
        Returns (neutral_v, slope). A healthy probe gives about 0.15-0.20 V/pH on this board."""
        if ph1 == ph2 or v1 == v2:
            raise ValueError('need two different buffers with different readings')
        slope = (v1 - v2) / (ph2 - ph1)
        if slope <= 0:
            raise ValueError('Po should fall as pH rises: check the buffers and the probe')
        self.slope = slope
        self.cal_temp = temperature
        self.neutral_v = v1 + (ph1 - 7.0) * slope
        return self.neutral_v, self.slope
