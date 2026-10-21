# DFRobot Gravity Analog Piezo Disk Vibration Sensor (DFR0052), MicroPython driver.
# The module is passive (DFRobot schematic rev 2.0): a 20 mm piezo disc (FT-20T-6.5A) in parallel
# with a 1 MOhm resistor and a 5.1 V zener, between the Analog pin and GND. The NC pin is not
# connected, so the module needs no supply. At rest the 1 MOhm resistor holds Analog at 0 V; a knock
# or vibration makes the disc produce a short voltage spike, bigger for a harder hit, clamped by the
# zener at about 5.1 V (and about -0.7 V the other way).
# Because the spikes last only milliseconds, read many quick samples and keep the peak.
from machine import ADC, Pin
import time


class PiezoVibration:
    def __init__(self, pin, vref=3.3):
        """pin: GPIO number (or Pin object) wired to the module's Analog pin.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref

    def voltage(self):
        """One reading of the Analog pin in volts (0 V at rest)."""
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def peak(self, window_ms=50):
        """Highest Analog voltage seen during window_ms: the strength of the latest knock/vibration."""
        hi = 0.0
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self.voltage()
            if v > hi:
                hi = v
        return hi

    def knocked(self, threshold=0.5, window_ms=50):
        """True if the peak within window_ms is above threshold volts."""
        return self.peak(window_ms) > threshold
