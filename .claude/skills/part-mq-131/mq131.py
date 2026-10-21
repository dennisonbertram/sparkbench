# MQ-131 ozone gas sensor module (Winsen MQ131 high-concentration sensor, 10-1000 ppm O3, on the common
# 4-pin VCC/GND/DO/AO board with an LM393 comparator), MicroPython driver.
# Datasheet basic circuit: the sensor resistance Rs and the load resistor RL form a divider from
# Vc (5.0 V +/-0.1 V), and AO is the voltage across RL:  VRL = Vc * RL / (Rs + RL).
# Datasheet formula: Rs = (Vc / VRL - 1) * RL.
# MQ131 is an OXIDISING-gas sensor: its conductivity DROPS as ozone rises (Winsen manual), so Rs rises
# and AO FALLS with ozone (datasheet Fig. 5: about 4 V in air down to about 1.7 V at 1000 ppm, RL 10 k).
# Concentration comes from Rs/R0 on the datasheet's log-log chart (Fig. 3), where R0 is the sensor
# resistance in clean air. R0 must be found by calibrating your own sensor; this driver gives the
# voltage, Rs and Rs/R0, not ppm.
# DO is the LM393 comparator output: LOW while AO is above the trimmer threshold, HIGH below it.
from machine import ADC, Pin


class MQ131:
    def __init__(self, ao, do=None, rl=10000, vc=5.0, divider=1.0, samples=32, vref=3.3):
        """ao/do: GPIO numbers (or Pin objects). rl: the module's load resistor in ohms (check the SMD
        resistor on yours: 103 = 10 kOhm, 102 = 1 kOhm). vc: module supply. divider: AO / ADC-pin voltage
        ratio if you fitted a resistor divider (e.g. 1.5 for 10k over 20k), 1.0 if AO goes straight in."""
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
        """Sensor resistance Rs in ohms: Rs = (Vc / VRL - 1) * RL (datasheet). Rises with ozone."""
        v = self.voltage()
        if v <= 0.001:
            return float('inf')  # no reading: sensor unpowered, AO not wired, or Rs off the scale
        return (self.vc / v - 1) * self.rl

    def calibrate(self, r0=None):
        """Store R0 (datasheet: resistance in clean air). With no argument, take the current Rs as R0
        (do this in clean air after the 48 h preheat and a few minutes of warm-up)."""
        self.r0 = self.resistance() if r0 is None else r0
        return self.r0

    def ratio(self):
        """Rs/R0, the ordinate of the datasheet's sensitivity chart (above 1 means ozone). Needs calibrate()."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        return self.resistance() / self.r0

    def do_low(self):
        """True when DO is LOW, i.e. AO is above the trimmer threshold (DO LED lit). Because AO falls
        with ozone, DO going HIGH is the ozone alarm on this sensor."""
        if self.do is None:
            raise ValueError('DO pin not given')
        return self.do.value() == 0
