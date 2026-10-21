# 0-25 V voltage sensor module (5:1 resistive divider), MicroPython driver.
# The module is just two resistors: R1 = 30 kOhm from the VCC screw terminal to S and
# R2 = 7.5 kOhm from S to GND. So
#   V(S)  = Vin * R2 / (R1 + R2) = Vin / 5
#   Vin   = V(S) * (R1 + R2) / R2 = 5 * V(S)
# The "+" header pin is not connected; "-" is ground, shared by the measured source and the MCU.
# On a 3.3 V board the ADC limits what you can measure: Vin max = 5 x the ADC's full scale
# (about 15.5 V on an ESP32 with 11 dB attenuation, 16.5 V on a Pico). Above that S exceeds the
# ADC range and can damage the pin.
from machine import ADC, Pin


class VoltageSensor:
    def __init__(self, pin, r1=30000, r2=7500, vref=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: widest input range; other ports have no atten()
        except AttributeError:
            pass
        self.ratio = (r1 + r2) / r2  # 5.0 for 30k / 7.5k
        self.vref = vref  # ADC reference for ports without read_uv() (Pico: the 3.3 V rail)
        self.samples = samples

    def sense_volts(self):
        """Average several samples and return the voltage on the S pin, in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def volts(self):
        """The measured voltage across the VCC/GND screw terminals, in volts."""
        return self.sense_volts() * self.ratio
