# MAX4466 electret microphone amplifier breakout (Adafruit #1063, header OUT, GND, VCC), MicroPython driver.
# The MAX4466 is a plain analog op-amp (Analog Devices/Maxim MAX4465-MAX4469 datasheet): no bus, no
# registers. The breakout biases its rail-to-rail output at VCC/2 and the audio rides on that level
# (DC coupled). Silence = a steady VCC/2; louder sound = a bigger swing around it, up to the supply rails.
# Gain is set by the trimmer on the back (about 25x to 125x).
# Loudness is therefore measured as the peak-to-peak spread of fast ADC samples over a short window
# (50 ms covers frequencies down to 20 Hz), exactly as Adafruit's own example does.
from machine import ADC, Pin
import time


class MAX4466:
    def __init__(self, out, vref=3.3):
        """out: GPIO number (or Pin) wired to OUT. vref: ADC full scale in volts, used when
        read_uv() is not available (e.g. Pico, where full scale is the 3.3 V supply)."""
        self.adc = ADC(Pin(out) if isinstance(out, int) else out)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref

    def voltage(self):
        """One OUT reading in volts."""
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def bias(self, n=64):
        """Average OUT level in volts: the VCC/2 bias point (about 1.65 V on a 3.3 V supply)."""
        total = 0
        for _ in range(n):
            total += self.voltage()
        return total / n

    def peak_to_peak(self, window_ms=50):
        """Spread (max - min) of OUT over window_ms, in volts: the loudness figure.
        About 0 in silence; at most the supply voltage (the output is rail-to-rail)."""
        lo = hi = self.voltage()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self.voltage()
            if v < lo:
                lo = v
            elif v > hi:
                hi = v
        return hi - lo
