# KY-036 metal touch sensor module (touch transistor + LM393 comparator, 4-pin AO/G/+/DO), MicroPython driver.
# Touching the metal tip of the transistor feeds a tiny body current into its base, so the transistor
# conducts and the sensor node AO falls (Joy-IT: "the signal is inverted"). The LM393 compares that
# node with the trimmer voltage; DO (with the module's pull-up) goes HIGH while the tip is touched
# and LED2 lights.
# Your body also picks up mains hum, so on real modules DO often flickers at 50/60 Hz while touched
# instead of staying HIGH. touched() therefore samples DO over a short window (default 40 ms, more
# than two mains periods) and reports a touch if DO was HIGH at any point in it.
# Power the module from 3.3 V on a 3.3 V board: AO and DO swing up to the supply.
from machine import ADC, Pin
import time


class KY036:
    def __init__(self, do, ao=None, window_ms=40, vref=3.3):
        """do: GPIO number (or Pin) wired to DO. ao: optional GPIO wired to AO (ADC pin).
        window_ms: how long touched() watches DO. vref: ADC full scale when read_uv() is missing."""
        # DO is driven by the LM393 with the board's pull-up; no internal pull needed.
        self.do = Pin(do, Pin.IN) if isinstance(do, int) else do
        self.window_ms = window_ms
        self.vref = vref
        self.adc = None
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range
            except AttributeError:
                pass

    def raw(self):
        """Instant logic level on DO: 1 = touch detected right now, 0 = not."""
        return self.do.value()

    def touched(self):
        """True if DO went HIGH at any time during window_ms (rides over mains-hum flicker)."""
        start = time.ticks_ms()
        while True:
            if self.do.value():
                return True
            if time.ticks_diff(time.ticks_ms(), start) >= self.window_ms:
                return False

    def voltage(self):
        """AO voltage in volts: higher when untouched, lower while the tip is touched."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535
