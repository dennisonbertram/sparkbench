# ADXL335 3-axis +/-3 g analog accelerometer (Analog Devices), MicroPython driver.
# Datasheet ADXL335 Rev. 0/B, Table 1 and "Use with operating voltages other than 3 V":
#   - Outputs are RATIOMETRIC to the chip supply VS (1.8-3.6 V).
#   - Zero-g output = VS / 2 (1.5 V typ at VS = 3 V).
#   - Sensitivity = 300 mV/g typ at VS = 3 V (270-330), i.e. about VS / 10 per g
#     (360 mV/g at 3.6 V, 195 mV/g at 2 V).
#   - Range +/-3 g minimum (+/-3.6 g typ). Turn-on about 1 ms + 160 ms per uF of CX/CY/CZ.
# So: a (g) = (Vout - VS/2) / (VS * 0.1)
# On the GY-61 module the chip runs from its on-board 3.3 V LDO, so vs = 3.3 by default.
# Real chips vary (zero-g X/Y 1.35-1.65 V at 3 V, Z 1.2-1.8 V): use calibrate() / zero= for accuracy.
from machine import ADC, Pin
import time


class ADXL335:
    def __init__(self, x_pin, y_pin, z_pin, vs=3.3, samples=16, vref=3.3):
        self.adcs = [self._adc(p) for p in (x_pin, y_pin, z_pin)]
        self.vs = vs            # chip supply voltage (GY-61: 3.3 V regulator output)
        self.samples = samples
        self.vref = vref        # ADC full scale when read_uv() is not available (e.g. Pico)
        self.zero = [vs / 2] * 3              # datasheet: zero-g output = VS / 2
        self.sens = [vs * 0.1] * 3            # datasheet: 300 mV/g at 3 V, ratiometric
        time.sleep_ms(2)        # datasheet turn-on time ~1 ms with the module's small caps

    @staticmethod
    def _adc(p):
        adc = ADC(Pin(p) if isinstance(p, int) else p)
        try:
            adc.atten(ADC.ATTN_11DB)   # ESP32: about 0-3.3 V input range
        except AttributeError:
            pass
        return adc

    def _volts(self, adc):
        total = 0
        if hasattr(adc, 'read_uv'):
            for _ in range(self.samples):
                total += adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += adc.read_u16() * self.vref / 65535
        return total / self.samples

    def voltages(self):
        """(Vx, Vy, Vz) in volts."""
        return tuple(self._volts(a) for a in self.adcs)

    def read(self):
        """(ax, ay, az) in g: (V - zero) / sensitivity per axis."""
        v = self.voltages()
        return tuple((v[i] - self.zero[i]) / self.sens[i] for i in range(3))

    def calibrate(self):
        """Lay the board flat, Z up (X = Y = 0 g, Z = +1 g), then call this to store the real zero-g levels."""
        v = self.voltages()
        self.zero[0] = v[0]
        self.zero[1] = v[1]
        self.zero[2] = v[2] - self.sens[2]
