# DFRobot Gravity: Analog pH Sensor / Meter Kit V2 (SEN0161-V2), MicroPython driver.
# The signal board has its own regulator, so the A output stays within 0-3.0 V on a 3.3-5.5 V supply.
# A is about 1500 mV in pH 7.00 buffer and about 2032 mV in pH 4.00 buffer (DFRobot_PH library defaults),
# i.e. A RISES as the liquid gets more acidic. DFRobot's two-point formula (DFRobot_PH.cpp readPH):
#     slope     = (7.0 - 4.0) / ((Vn - 1500)/3 - (Va - 1500)/3)
#     intercept = 7.0 - slope * (Vn - 1500)/3
#     pH        = slope * (V - 1500)/3 + intercept           (all voltages in mV)
# which is the same as pH = 7 - 3 * (V - Vn) / (Va - Vn).
# Vn / Va = A voltage measured in pH 7.00 / pH 4.00 buffer. Calibrate them with calibrate() for real readings.
from machine import ADC, Pin

NEUTRAL_MV = 1500.0   # typical A voltage in pH 7.00 buffer at 25 C
ACID_MV = 2032.44     # typical A voltage in pH 4.00 buffer at 25 C


class GravityPH:
    def __init__(self, a, neutral_mv=NEUTRAL_MV, acid_mv=ACID_MV, samples=20, vref=3.3):
        """a: GPIO number (or Pin) wired to the board's A pin.
        neutral_mv / acid_mv: A voltage (mV) in pH 7.00 / pH 4.00 buffer (from calibrate()).
        vref: ADC full scale in volts, used only when the port has no read_uv() (e.g. Pico: 3.3)."""
        self.adc = ADC(Pin(a) if isinstance(a, int) else a)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.neutral_mv = neutral_mv
        self.acid_mv = acid_mv
        self.samples = samples
        self.vref = vref

    def millivolts(self):
        """A voltage in mV: median of several samples (the probe signal is high impedance and noisy)."""
        vals = []
        for _ in range(self.samples):
            if hasattr(self.adc, 'read_uv'):
                vals.append(self.adc.read_uv() / 1000)
            else:
                vals.append(self.adc.read_u16() * self.vref * 1000 / 65535)
        vals.sort()
        n = len(vals)
        return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2

    def ph(self, mv=None):
        """pH from the A voltage (mV), DFRobot two-point line through (neutral_mv, 7.0) and (acid_mv, 4.0)."""
        if mv is None:
            mv = self.millivolts()
        slope = (7.0 - 4.0) / ((self.neutral_mv - 1500.0) / 3.0 - (self.acid_mv - 1500.0) / 3.0)
        intercept = 7.0 - slope * (self.neutral_mv - 1500.0) / 3.0
        return slope * (mv - 1500.0) / 3.0 + intercept

    def calibrate(self, mv=None):
        """Put the rinsed probe in pH 7.00 or pH 4.00 buffer, wait for the reading to settle, then call this.
        Like DFRobot_PH, it recognises the buffer from the voltage window (7.00: 1322-1678 mV, 4.00: 1854-2210 mV),
        stores it and returns 7.0 or 4.0. Save neutral_mv / acid_mv yourself (e.g. in a file) to reuse them."""
        if mv is None:
            mv = self.millivolts()
        if 1322 < mv < 1678:
            self.neutral_mv = mv
            return 7.0
        if 1854 < mv < 2210:
            self.acid_mv = mv
            return 4.0
        raise ValueError('%.0f mV is not a pH 7.00 or 4.00 buffer reading' % mv)
