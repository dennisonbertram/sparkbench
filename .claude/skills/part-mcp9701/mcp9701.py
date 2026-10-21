# MCP9701 / MCP9701A low-power linear active thermistor IC (Microchip), MicroPython driver.
# Datasheet MCP970X DS20001942L: VDD = 3.1-5.5 V, IDD 6 uA typ, TA = -10 to +125 °C.
# Equation 4-1: VOUT = TC * TA + V0C, with TC = 19.5 mV/°C and V0C = 400 mV,
# so TA(°C) = (VOUT(mV) - 400) / 19.5. Output 205 mV (-10 °C) to 2.84 V (+125 °C).
# Turn-on time 800 us typ, so readings are valid right after power-up.
from machine import ADC, Pin


class MCP9701:
    V0C_MV = 400.0      # DC characteristics: output voltage at 0 °C
    TC_MV_PER_C = 19.5  # DC characteristics: temperature coefficient

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: widest input range; other ports have no atten()
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
        """Temperature in °C: TA = (VOUT - 400 mV) / 19.5 mV per °C (datasheet Equation 4-1)."""
        return (self.millivolts() - self.V0C_MV) / self.TC_MV_PER_C
