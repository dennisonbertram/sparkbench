# DFRobot Gravity: Steam Sensor V2 (SKU SEN0121), MicroPython driver.
# The board has a pad of bare interleaved gold traces and a few passive parts; no chip, no
# protocol. Its analog output A is about 0 V when the pad is dry and RISES as steam, mist or
# water droplets wet the traces (DFRobot: "The output voltage will increase when the humidity
# of the sensor surface goes up"). DFRobot spec: output 0-3.0 V on a 3.3 V supply, 0-4.5 V on
# a 5 V supply. There is no volts-to-humidity formula: the reading is relative, so calibrate a
# "wet" threshold for your own setup.
# Power the module from 3.3 V when A goes straight to a 3.3 V ADC (ESP32 / Pico): on 5 V the
# output can reach 4.5 V. If you must use 5 V, put a divider on A and pass its ratio here.
from machine import ADC, Pin


class GravitySteamSensor:
    def __init__(self, pin, samples=16, vref=3.3, divider=1.0):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full ~0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref        # ADC reference when read_uv() is not available (e.g. Pico)
        self.divider = divider  # (top + bottom) / bottom of an external divider on A, 1.0 if none

    def raw(self):
        """One 16-bit ADC reading (0-65535): higher = wetter."""
        return self.adc.read_u16()

    def volts(self):
        """Average several samples and return the voltage on the module's A pin in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def wet(self, threshold_v=1.0):
        """True when the output is above threshold_v (steam or droplets on the pad).
        The default 1.0 V is only a starting point; calibrate it for your setup."""
        return self.volts() > threshold_v
