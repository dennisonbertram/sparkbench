# Water level sensor module (common red 3-pin "Water Level Sensor" board, header S + -), MicroPython driver.
# Circuit (module schematic): one set of the exposed traces is fed from + through 100 ohm, the other set
# goes to the base of an S8050 NPN transistor wired as an emitter follower; S is the emitter, loaded by
# 100 ohm to ground. Dry: no base current, S = 0 V. Wetter (more trace covered, or more conductive water):
# more base current, S rises. S can never exceed about V(+) - VBE (roughly V(+) - 0.7 V).
# The output is NOT calibrated in mm: it depends on the water's conductivity, so calibrate dry/full
# readings in your own tank and use level() for a 0-100 % estimate.
from machine import ADC, Pin
import time


class WaterLevel:
    def __init__(self, s, power=None, samples=16, vref=3.3, settle_ms=10):
        """s: GPIO number (or Pin) wired to S (an ADC pin). power: optional GPIO that feeds the module's
        + pin so it is only powered while reading (slows the traces' corrosion). Only do this if the pin
        can source the module's current (up to about 25 mA fully wet at 3.3 V); otherwise switch + with
        a transistor. vref: ADC full scale used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(s) if isinstance(s, int) else s)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.power = None
        if power is not None:
            self.power = Pin(power, Pin.OUT, value=0) if isinstance(power, int) else power
            self.power.value(0)
        self.samples = samples
        self.vref = vref
        self.settle_ms = settle_ms
        self.dry_v = 0.0
        self.full_v = None

    def voltage(self):
        """S voltage in volts, averaged over several ADC samples."""
        if self.power is not None:
            self.power.value(1)
            time.sleep_ms(self.settle_ms)
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        if self.power is not None:
            self.power.value(0)
        return total / self.samples

    def calibrate(self, dry_v=None, full_v=None):
        """Store the S voltage with the sensor dry and at your 'full' mark. Call with no argument while
        the sensor is at the full mark to take the current reading as full_v."""
        if dry_v is not None:
            self.dry_v = dry_v
        self.full_v = self.voltage() if full_v is None else full_v
        return self.dry_v, self.full_v

    def level(self):
        """Rough level in % between the calibrated dry and full readings (not linear in depth)."""
        if not self.full_v or self.full_v <= self.dry_v:
            raise ValueError('call calibrate() at the full mark first')
        p = (self.voltage() - self.dry_v) * 100 / (self.full_v - self.dry_v)
        return min(100.0, max(0.0, p))

    def wet(self, threshold=0.2):
        """True when S is above threshold volts, i.e. water is touching the traces."""
        return self.voltage() > threshold
