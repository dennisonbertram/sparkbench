# TMP235 analog output temperature sensor (Texas Instruments), MicroPython driver.
# Datasheet SBOS857E (TMP235/TMP236): VDD = 2.3-5.5 V, 9 uA typ, turn-on time 800 us typ.
# Output: 500 mV at 0 °C, +10 mV/°C (TMP235), -40 °C to +150 °C.
# Section 7.3, Equation 2: TA = (VOUT - VOFFS) / TC + TINFL, with the
# Table 1 piecewise linear segments (VRANGE in mV -> TINFL, TC, VOFFS):
#   VOUT < 1500 mV           ->   0 °C, 10.0 mV/°C,  500 mV   (-40 to +100 °C)
#   1500 to 1752.5 mV        -> 100 °C, 10.1 mV/°C, 1500 mV   (100 to 125 °C)
#   VOUT > 1752.5 mV         -> 125 °C, 10.6 mV/°C, 1752.5 mV (125 to 150 °C)
# Pass piecewise=False to use the first row for every voltage (datasheet allows this
# when the accuracy enhancement above 100 °C is not needed).
from machine import ADC, Pin


class TMP235:
    # (upper VOUT limit in mV, TINFL °C, TC mV/°C, VOFFS mV) - datasheet Table 1
    SEGMENTS = (
        (1500.0, 0.0, 10.0, 500.0),
        (1752.5, 100.0, 10.1, 1500.0),
        (None, 125.0, 10.6, 1752.5),
    )

    def __init__(self, pin, samples=32, vref=3.3, piecewise=True):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.piecewise = piecewise

    def millivolts(self):
        """Average several ADC samples and return VOUT in mV."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref * 1000 / 65535
        return total / self.samples

    @classmethod
    def mv_to_celsius(cls, mv, piecewise=True):
        """Datasheet Equation 2: TA = (VOUT - VOFFS) / TC + TINFL."""
        seg = cls.SEGMENTS[0]
        if piecewise:
            for s in cls.SEGMENTS:
                seg = s
                if s[0] is None or mv < s[0]:
                    break
        _, t_infl, tc, v_offs = seg
        return (mv - v_offs) / tc + t_infl

    def temperature(self):
        """Temperature in °C."""
        return self.mv_to_celsius(self.millivolts(), self.piecewise)
