# MAX9814 AGC electret microphone amplifier breakout (Adafruit #1713, header pins 1-5: GND, Vdd, Gain, Out, AR),
# MicroPython driver.
# The MAX9814 (Analog Devices/Maxim datasheet) is an analog mic preamp with automatic gain control:
# no bus, no registers. Its output MICOUT sits at a DC bias of 1.23 V typical (1.14-1.32 V; the board
# prints "DC Offset: 1.25V") and the audio rides on that level. Silence = a steady ~1.25 V; louder sound =
# a bigger swing around it, about 2 Vpp at most (0.707 Vrms max output level). The bias and the maximum
# swing do not depend on VDD, so Out stays below about 2.3 V even on a 5 V supply.
# Max gain is set by the Gain pin (float 60 dB, GND 50 dB, Vdd 40 dB); the AGC turns loud sounds down.
# Loudness is measured as the peak-to-peak spread of fast ADC samples over a short window
# (50 ms covers frequencies down to 20 Hz).
from machine import ADC, Pin
import time


class MAX9814:
    def __init__(self, out, vref=3.3):
        """out: GPIO number (or Pin) wired to Out. vref: ADC full scale in volts, used when
        read_uv() is not available (e.g. Pico, where full scale is the 3.3 V supply)."""
        self.adc = ADC(Pin(out) if isinstance(out, int) else out)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref

    def voltage(self):
        """One Out reading in volts."""
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def bias(self, n=64):
        """Average Out level in volts: the DC bias point (about 1.25 V)."""
        total = 0
        for _ in range(n):
            total += self.voltage()
        return total / n

    def peak_to_peak(self, window_ms=50):
        """Spread (max - min) of Out over window_ms, in volts: the loudness figure.
        About 0 in silence, up to about 2 V for loud sound."""
        lo = hi = self.voltage()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self.voltage()
            if v < lo:
                lo = v
            elif v > hi:
                hi = v
        return hi - lo
