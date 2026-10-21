# MCP9700 / MCP9700A low-power linear active thermistor IC (Microchip), MicroPython driver.
# Datasheet MCP970X DS20001942L: VDD = 2.3-5.5 V, IDD 6 uA typ.
# Equation 4-1: VOUT = TC * TA + V0C, with TC = 10.0 mV/°C and V0C = 500 mV,
# so TA(°C) = (VOUT(mV) - 500) / 10. Output range 100 mV (-40 °C) to 1.75 V (+125 °C).
# Turn-on time 800 us typ, so readings are valid right after power-up.
from machine import ADC, Pin


class MCP9700:
    V0C_MV = 500.0   # DC characteristics: output voltage at 0 °C
    TC_MV_PER_C = 10.0  # DC characteristics: temperature coefficient

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

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

    def temperature(self):
        """Temperature in °C: TA = (VOUT - 500 mV) / 10 mV per °C (datasheet Equation 4-1)."""
        return (self.millivolts() - self.V0C_MV) / self.TC_MV_PER_C
