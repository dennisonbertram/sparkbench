# LM335 / LM335A precision temperature sensor (Texas Instruments, SNIS160E), MicroPython driver.
# The LM335 is a 2-terminal zener whose breakdown voltage is proportional to absolute
# temperature: 10 mV/K, so 2.98 V at 25 C (298.15 K). It must be biased with a resistor
# from a supply to V+ so that 0.4 mA to 5 mA flows (datasheet Recommended Operating
# Conditions; 1 mA nominal). Read the voltage at V+ with an ADC:
#     T(K) = Vout(mV) / 10        T(C) = T(K) - 273.15
from machine import ADC, Pin


class LM335:
    MV_PER_K = 10.0  # datasheet output voltage temperature coefficient

    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.scale = 1.0  # one-point calibration factor (see calibrate())

    def millivolts(self):
        """Average several ADC samples and return the voltage across the LM335 in mV."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref * 1000 / 65535
        return total / self.samples

    def kelvin(self):
        """Absolute temperature: T(K) = Vout / 10 mV per K, times the calibration factor."""
        return self.millivolts() / self.MV_PER_K * self.scale

    def temperature(self):
        """Temperature in degrees C."""
        return self.kelvin() - 273.15

    def calibrate(self, true_c):
        """One-point calibration at a known temperature. The output is proportional to
        absolute temperature, so a single scale factor corrects the slope error over the
        whole range (datasheet 7.3.1). Same idea as the ADJ-pin trim, done in software."""
        self.scale = 1.0
        self.scale = (true_c + 273.15) / self.kelvin()
