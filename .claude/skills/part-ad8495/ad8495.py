# AD8495 K-type thermocouple amplifier with cold junction compensation (Analog Devices),
# MicroPython driver for the Adafruit AD8495 breakout (#1778).
# Datasheet AD8494/AD8495/AD8496/AD8497 Rev. D: VOUT = (TMJ x 5 mV/°C) + VREF, so
# TMJ = (VOUT - VREF) / (5 mV/°C). The Adafruit board ties REF to a TLVH431 1.25 V
# reference, so T(°C) = (Vout - 1.25 V) / 0.005 V. Linearity error < ±2 °C for a
# K-type thermocouple from -25 °C to +400 °C (datasheet Table 7); beyond that see AN-1087.
# Output swing is -VS + 0.025 V to +VS - 0.1 V (Table 2): at 3.3 V supply the usable
# range is about -245 °C to +390 °C. An open thermocouple drives the output to the rail.
from machine import ADC, Pin


class AD8495:
    MV_PER_C = 5.0  # datasheet transfer function, 5 mV/°C

    def __init__(self, pin, vref_out=1.25, samples=32, adc_vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vref_out = vref_out  # voltage on the AD8495 REF pin (1.25 V on the Adafruit board)
        self.samples = samples
        self.adc_vref = adc_vref  # ADC reference used when read_uv() is not available (e.g. Pico)

    def volts(self):
        """Average several ADC samples and return the OUT voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.adc_vref / 65535
        return total / self.samples

    def temperature(self):
        """Measurement-junction temperature in °C: (Vout - Vref) / 5 mV per °C."""
        return (self.volts() - self.vref_out) * 1000 / self.MV_PER_C
