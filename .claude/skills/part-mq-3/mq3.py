# MQ-3 alcohol gas sensor module (Hanwei MQ-3 on the common 4-pin VCC/GND/DO/AO board with an
# LM393 comparator), MicroPython driver.
# Datasheet basic measuring circuit: the sensor resistance Rs and the load resistor RL form a divider
# from Vc (5 V on the module), and AO is the voltage across RL:  VRL = Vc * RL / (Rs + RL).
# So Rs = (Vc / VRL - 1) * RL.  Alcohol lowers Rs, so AO rises with alcohol.
# Concentration comes from Rs/R0 on the datasheet's log-log chart (Fig. 2), where R0 is the sensor's
# resistance at 0.4 mg/L alcohol (about 200 ppm). R0 differs from sensor to sensor (1-8 MOhm), so this
# driver gives the voltage, Rs and Rs/R0, not mg/L.
# DO is the LM393 comparator output: it goes LOW when AO is above the threshold set on the trimmer.
from machine import ADC, Pin


class MQ3:
    def __init__(self, ao, do=None, rl=200000, vc=5.0, divider=1.0, samples=32, vref=3.3):
        """ao/do: GPIO numbers (or Pin objects). rl: the module's load resistor in ohms (datasheet
        recommends 200 kOhm, 100k-470k; check the resistor on your board). vc: module supply.
        divider: AO / ADC-pin voltage ratio if you fitted a resistor divider (e.g. 1.5 for 10k over
        20k), 1.0 if AO goes straight to the pin."""
        self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.do = None if do is None else (Pin(do, Pin.IN) if isinstance(do, int) else do)
        self.rl = rl
        self.vc = vc
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.r0 = None

    def voltage(self):
        """AO voltage (VRL) in volts, averaged over several ADC samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def resistance(self):
        """Sensor resistance Rs in ohms: Rs = (Vc / VRL - 1) * RL."""
        v = self.voltage()
        if v <= 0.001:
            return float('inf')  # no reading: sensor cold, unpowered or AO not wired
        return (self.vc / v - 1) * self.rl

    def calibrate(self, r0=None):
        """Store R0. With no argument, take the current Rs as R0. The datasheet defines R0 at
        0.4 mg/L alcohol in clean air; do this after the 24 h preheat and a few minutes of warm-up."""
        self.r0 = self.resistance() if r0 is None else r0
        return self.r0

    def ratio(self):
        """Rs/R0, the ordinate of the datasheet's sensitivity chart. Needs calibrate() first."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        return self.resistance() / self.r0

    def detected(self):
        """True when DO is LOW, i.e. AO is above the trimmer threshold (DO LED lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 0
