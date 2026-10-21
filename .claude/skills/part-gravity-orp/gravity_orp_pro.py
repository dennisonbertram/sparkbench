# DFRobot Gravity Analog ORP Sensor PRO (SEN0464), MicroPython driver.
# The signal converter adds the probe's ORP (platinum vs Ag/AgCl, -2000..+2000 mV) to a fixed internal
# reference of 2480 mV and outputs the sum on A (gain 1), about 0.48-4.48 V. DFRobot's DFRobot_ORP_PRO library:
#     ORP (mV) = V_A (mV) - (2480 mV + calibration)
# calibration = V_A - 2480 measured with the probe input shorted (S+ to S-, i.e. 0 mV ORP); 0 by default.
# Supply the board from a steady 5 V. On a 3.3 V board, A goes to the ADC through a divider (it reaches about
# 4.5 V); pass divider = (top + bottom) / bottom, e.g. 1.5 for 10 k / 20 k.
from machine import ADC, Pin

BASE_MV = 2480.0


class GravityORP:
    def __init__(self, a, calibration=0.0, samples=20, vref=3.3, divider=1.0):
        """a: GPIO number (or Pin) wired to the board's A pin (through the divider, if any).
        calibration: offset in mV from calibrate_zero() (0 until calibrated).
        divider: A voltage / ADC-pin voltage (1.5 for a 10 k / 20 k divider).
        vref: ADC full scale used when read_uv() is unavailable (e.g. Pico: 3.3)."""
        self.adc = ADC(Pin(a) if isinstance(a, int) else a)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.calibration = calibration
        self.samples = samples
        self.vref = vref
        self.divider = divider

    def voltage(self):
        """Voltage on the board's A pin in volts (median of several ADC samples, divider undone)."""
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

    def orp(self, v=None):
        """ORP in mV: V_A(mV) - (2480 + calibration)."""
        if v is None:
            v = self.voltage()
        return v * 1000.0 - (BASE_MV + self.calibration)

    def calibrate_zero(self):
        """Short the probe input (S+ to S-, 0 mV) and call this: stores and returns V_A - 2480 mV."""
        self.calibration = self.voltage() * 1000.0 - BASE_MV
        return self.calibration
