# LM35 precision centigrade temperature sensor (Texas Instruments), MicroPython driver.
# Basic centigrade circuit from the datasheet (SNIS159H, Figure 14): +Vs = 4-30 V,
# VOUT = 0 mV + 10.0 mV/°C, so T(°C) = Vout(mV) / 10. Valid from +2 °C to 150 °C
# (LM35DZ is specified for 0 to 100 °C). Below about +2 °C the output cannot go negative
# in this circuit and simply sits near 0 V.
from machine import ADC, Pin


class LM35:
    MV_PER_C = 10.0  # datasheet scale factor

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def millivolts(self):
        """Average several ADC samples and return the output voltage in mV."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref * 1000 / 65535
        return total / self.samples

    def temperature(self):
        """Temperature in °C: T = Vout / 10 mV per °C."""
        return self.millivolts() / self.MV_PER_C
