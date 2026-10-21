# KY-024 linear Hall magnetic sensor module (AH49E / 49E linear Hall IC + LM393 comparator,
# 4-pin AO/G/+/DO), MicroPython driver.
# AO is the Hall IC's output. AH49E datasheet (Diodes DS36517, @VCC = 5 V): quiescent output
# VNULL = 2.5 V typ (2.25-2.75 V) at B = 0, sensitivity 1.6 mV/gauss typ (1.1-2.1), field range
# +-1000 G typ (+-650 G min), output span 0.8 V to VCC-0.8 V typ. The output is set by the supply
# (null = VCC/2), so at another supply both null and sensitivity scale by VCC/5 V.
# A south pole facing the printed face of the sensor raises AO, a north pole lowers it (Joy-IT).
# The LM393 compares AO with the blue trimmer; on the Joy-IT KY-024 DO goes HIGH (LED2 lit) when
# the threshold is passed. Pass active_high=False for clones whose DO goes LOW instead.
# Power + from 3.3 V on a 3.3 V board (AH49E runs from 3.0-6.5 V): at 5 V AO reaches about 4.2 V.
# The null varies +-10 % part to part: call zero() with no magnet near for accurate readings.
from machine import ADC, Pin


class KY024:
    def __init__(self, ao, do=None, vcc=3.3, sens_mv_per_g_5v=1.6, active_high=True, samples=16, vref=3.3):
        """ao: GPIO (or Pin) wired to AO (ADC pin). do: optional GPIO wired to DO.
        vcc: the module's supply voltage on +. sens_mv_per_g_5v: AH49E sensitivity at 5 V (typ 1.6).
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.active_high = active_high
        self.samples = samples
        self.vref = vref
        self.vcc = vcc
        self.null_v = vcc / 2                                   # VNULL scales with supply: 2.5 V at 5 V
        self.v_per_g = sens_mv_per_g_5v / 1000 * vcc / 5.0     # ratiometric sensitivity

    def voltage(self):
        """AO voltage in volts, averaged over `samples` readings."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def zero(self):
        """Store the present AO voltage as the 0 G null. Call with no magnet nearby."""
        self.null_v = self.voltage()
        return self.null_v

    def gauss(self):
        """Field in gauss (1 mT = 10 G): positive = south pole at the printed face, negative = north.
        Typical accuracy only (sensitivity 1.1-2.1 mV/G); readings beyond about +-1000 G saturate."""
        return (self.voltage() - self.null_v) / self.v_per_g

    def triggered(self):
        """True when DO reports the field past the trimmer threshold (LED2 lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == (1 if self.active_high else 0)
