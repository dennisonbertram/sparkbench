# Seeed Grove - Temperature Sensor v1.2 (Murata NCP18WF104F03RC NTC thermistor), MicroPython driver.
# Circuit (Seeed schematic v1.1/v1.2): VCC -- NTC (100 kOhm @ 25 degC) -- node -- R1 100 kOhm 1% -- GND,
# and the node is buffered onto SIG by an LMV358 op-amp voltage follower. So
#   V_SIG = Vcc * R1 / (R1 + R_ntc)   ->   R_ntc = R1 * (Vcc / V_SIG - 1)
# Temperature from the thermistor's B-constant equation (Murata: R25 = 100 kOhm, B25/50 = 4250 K):
#   1 / T(K) = 1 / 298.15 + ln(R_ntc / R25) / B
# Warmer = lower NTC resistance = HIGHER voltage on SIG. At 25 degC SIG sits at half the supply.
import math
from machine import ADC, Pin


class GroveTemp:
    R1 = 100000.0      # ohms, fixed resistor from the divider node to GND
    R25 = 100000.0     # ohms, NCP18WF104F03RC at 25 degC
    BETA = 4250.0      # K, B25/50 (Murata NCP18WF104, datasheet); Seeed's Arduino demo uses 4275
    T25 = 298.15       # K

    def __init__(self, pin, vcc=3.3, samples=32, vref=3.3, beta=BETA):
        """pin: GPIO number (or Pin) wired to SIG. vcc: the voltage on the module's VCC pin.
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.samples = samples
        self.vref = vref
        self.beta = beta

    def voltage(self):
        """Averaged voltage on SIG in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self):
        """Thermistor resistance in ohms, from the divider equation."""
        v = self.voltage()
        if v <= 0:
            return float('inf')  # thermistor open, or SIG not connected
        if v >= self.vcc:
            return 0.0  # thermistor shorted (or far above 125 degC)
        return self.R1 * (self.vcc / v - 1)

    def temperature(self):
        """Temperature in degC from the B-constant equation."""
        r = self.resistance()
        if r <= 0 or r == float('inf'):
            raise ValueError('Grove temp: SIG reads 0 V or full supply, check the wiring')
        inv_t = 1 / self.T25 + math.log(r / self.R25) / self.beta
        return 1 / inv_t - 273.15
