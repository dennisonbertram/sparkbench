# TMP36 low-voltage centigrade temperature sensor (Analog Devices), MicroPython driver.
# Datasheet TMP35/TMP36/TMP37 Rev. E, Table 1 and Table 4: +Vs = 2.7-5.5 V,
# VOUT = 0.5 V offset + 10 mV/°C, i.e. 750 mV at 25 °C, 100 mV at -40 °C, 1.75 V at 125 °C.
# So T(°C) = (Vout(mV) - 500) / 10. Specified -40 °C to +125 °C (operates to 150 °C at 5 V).
# Turn-on time is 1 ms max, so readings are valid almost immediately after power-up.
from machine import ADC, Pin


class TMP36:
    OFFSET_MV = 500.0  # datasheet Table 4: 0.5 V offset
    MV_PER_C = 10.0    # datasheet Table 1: scale factor 10 mV/°C

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
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
        """Temperature in °C: T = (Vout - 500 mV) / 10 mV per °C."""
        return (self.millivolts() - self.OFFSET_MV) / self.MV_PER_C
