# MQ-137 ammonia (NH3) gas sensor module (Winsen/Hanwei MQ137 on the common 4-pin
# VCC/GND/DO/AO board with an LM393 comparator), MicroPython driver.
# Datasheet basic test circuit: the sensor resistance Rs and the load resistor RL form a divider
# from Vc (5 V on the module), and AO is the voltage across RL:  VRL = Vc * RL / (Rs + RL).
# Hence Rs = (Vc / VRL - 1) * RL.  NH3 raises the sensor's conductivity (lowers Rs), so AO rises.
# Concentration comes from Rs/R0 on the datasheet's log-log sensitivity curve (Fig. 3), where
# R0 is the sensor's resistance in CLEAN AIR. The curve is typical only and every sensor differs,
# so R0 must be measured on your own sensor; this driver gives the voltage, Rs and Rs/R0, not ppm.
# DO is the LM393 comparator output: it goes LOW when AO is above the threshold set on the trimmer.
from machine import ADC, Pin


class MQ137:
    def __init__(self, ao, do=None, rl=1000, vc=5.0, divider=1.0, samples=32, vref=3.3, div=None):
        """ao/do: GPIO numbers (or Pin objects). rl: the module's load resistor in ohms (check yours:
        many boards use 1 kOhm, marked 102; the datasheet's Fig. 5 uses 4.7 kOhm and 47 kOhm is a
        common upgrade). vc: module supply. divider: AO / ADC-pin voltage ratio if you fitted a
        resistor divider (e.g. 1.5 for 10k over 20k), 1.0 if AO goes straight to the pin."""
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
        # A (top, bottom) resistor divider between the output and the ADC pin scales the reading and also loads
        # the load resistor: RL is then in parallel with top + bottom.
        self.rl_eff = rl
        if div:
            self.divider = (div[0] + div[1]) / div[1]
            self.rl_eff = rl * (div[0] + div[1]) / (rl + div[0] + div[1])

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
        """Sensor resistance Rs in ohms: Rs = (Vc / VRL - 1) * RL (datasheet test circuit)."""
        v = self.voltage()
        if v <= 0.001:
            return float('inf')  # no reading: sensor cold, unpowered or AO not wired
        return (self.vc / v - 1) * self.rl_eff

    def vrl(self):
        """The output voltage the datasheet's formula uses, with nothing loading it: Vc * RL / (Rs + RL)."""
        rs = self.resistance()
        return 0.0 if rs == float('inf') else self.vc * self.rl / (rs + self.rl)

    def calibrate(self, r0=None):
        """Store R0. With no argument, take the current Rs as R0. The datasheet's R0 is Rs in
        clean air, so call this in fresh outdoor-like air after burn-in and warm-up."""
        self.r0 = self.resistance() if r0 is None else r0
        return self.r0

    def ratio(self):
        """Rs/R0, the ordinate of the datasheet's sensitivity curve. Needs calibrate() first."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        return self.resistance() / self.r0

    def detected(self):
        """True when DO is LOW, i.e. AO is above the trimmer threshold (DO LED lit)."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 0
