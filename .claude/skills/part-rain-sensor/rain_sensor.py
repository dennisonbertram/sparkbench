# FC-37 / YL-83 rain sensor module (sensing pad + LM393 comparator board, header AO DO GND VCC),
# MicroPython driver.
# The pad is a pair of interleaved copper traces: water bridges them and lowers their resistance.
# On the comparator board the pad sits between AO and GND with a pull-up resistor to VCC, so
# AO is near VCC when dry and FALLS as the pad gets wet. One LM393 (TI datasheet) compares AO with
# the trimmer voltage; its open-collector output DO (pulled up to VCC on the board) goes LOW when
# AO drops below the threshold, i.e. when the pad is wet enough. The DO LED lights at the same time.
# The board has no calibration: the voltage depends on VCC, the water and the pad's corrosion.
import time
from machine import ADC, Pin


class RainSensor:
    def __init__(self, ao, do=None, power=None, divider=1.0, samples=16, vref=3.3, settle_ms=10):
        """ao/do: GPIO numbers (or Pin objects); do and ao may be None if unused.
        power: optional GPIO that feeds VCC, so the pad is only powered while reading (slows corrosion).
        divider: AO / ADC-pin voltage ratio if you fitted a resistor divider (module on 5 V), else 1.0."""
        self.adc = None
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
            except AttributeError:
                pass
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.power = None if power is None else (Pin(power, Pin.OUT, value=0) if isinstance(power, int) else power)
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.settle_ms = settle_ms

    def _on(self):
        if self.power is not None:
            self.power.value(1)
            time.sleep_ms(self.settle_ms)

    def _off(self):
        if self.power is not None:
            self.power.value(0)

    def voltage(self):
        """AO voltage in volts (averaged): high = dry, lower = wetter."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        self._on()
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        self._off()
        return total / self.samples * self.divider

    def wetness(self, vcc=3.3):
        """Rough wetness 0-100 %: 0 = AO at VCC (dry pad), 100 = AO at 0 V (pad shorted by water)."""
        w = (1 - self.voltage() / vcc) * 100
        return min(100.0, max(0.0, w))

    def raining(self):
        """True when DO is LOW: the pad is wetter than the trimmer threshold (DO LED lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        self._on()
        wet = self.do.value() == 0
        self._off()
        return wet
