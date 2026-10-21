# SparkFun Weather Meter Kit (SEN-15901) wind vane, MicroPython driver.
# The vane is passive: eight reed switches, each in series with its own resistor, all in parallel
# between the two outer conductors of the RJ11 cable (pins 1 and 4; the anemometer uses 2 and 3).
# The vane's magnet closes one switch, or two neighbours at once, so the cable shows one of the 16
# resistances in the datasheet table. A pull-up resistor (10 kOhm, as in the datasheet's example
# circuit) from 3.3 V to the vane makes a divider read by the ADC:
#   V = Vs * R / (R + Rpullup)        R = Rpullup * V / (Vs - V)
# The direction is the table entry closest to R (compared on a log scale, since neighbouring
# entries differ by a ratio, e.g. 688 / 891 / 1000 ohms).
from machine import ADC, Pin
import math

# (degrees, ohms) from the Weather Meter datasheet (DS-15901).
TABLE = (
    (0.0, 33000), (22.5, 6570), (45.0, 8200), (67.5, 891),
    (90.0, 1000), (112.5, 688), (135.0, 2200), (157.5, 1410),
    (180.0, 3900), (202.5, 3140), (225.0, 16000), (247.5, 14120),
    (270.0, 120000), (292.5, 42120), (315.0, 64900), (337.5, 21880),
)
NAMES = ('N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
         'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW')


class WindVane:
    def __init__(self, pin, pullup=10000, vsupply=3.3, samples=16):
        """pin: GPIO of the ADC pin the vane is wired to (with `pullup` ohms from it to vsupply)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.pullup = pullup
        self.vs = vsupply
        self.samples = samples

    def volts(self):
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vs / 65535
        return total / self.samples

    def resistance(self, v=None):
        """Vane resistance in ohms, or None if the vane reads open (cable unplugged)."""
        if v is None:
            v = self.volts()
        if v >= self.vs * 0.97:  # above ~320 kOhm with 10 kOhm: no switch closed
            return None
        if v <= 0:
            return 0.0
        return self.pullup * v / (self.vs - v)

    def index(self, r=None):
        """Position 0-15 (0 = N, 22.5 degree steps clockwise), or None when open."""
        if r is None:
            r = self.resistance()
        if r is None:
            return None
        r = max(r, 1.0)
        best, err = 0, 1e9
        for i, (_, ohms) in enumerate(TABLE):
            e = abs(math.log(r / ohms))
            if e < err:
                best, err = i, e
        return best

    def degrees(self):
        i = self.index()
        return None if i is None else TABLE[i][0]

    def name(self):
        i = self.index()
        return None if i is None else NAMES[i]
