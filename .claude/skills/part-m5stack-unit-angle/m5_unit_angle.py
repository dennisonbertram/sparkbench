# M5Stack Unit Angle (SKU U005), MicroPython driver.
# Circuit (M5Stack docs, Unit Angle schematic + output-voltage diagram):
#   5V --- R1 (10 kOhm) ---+--- R2 10 kOhm potentiometer track --- GND
#                          the wiper of R2 goes straight to the Grove "Analog Output" pin (white wire).
#   Uo = 5000 mV * Rp / (Rp + R1), Rp = wiper-to-GND resistance (0 .. 10 kOhm).
#   So Uo runs from 0 V (knob at the GND end) to 2.5 V (knob at the top end), and the curve is
#   NOT linear in knob angle: it bends over towards the top (half-way gives 1.67 V, not 1.25 V).
# There is no regulator or buffer on the unit: Uo scales with the 5V supply.
# Note: one revision of M5Stack's schematic shows R1 = 4.7 kOhm (Uo up to 3.4 V); pass r1=4700 if
# your unit has that resistor. The published specification (0-2500 mV) matches R1 = 10 kOhm.
from machine import ADC, Pin

R1 = 10000      # fixed resistor from 5V to the top of the track, ohms
R_POT = 10000   # potentiometer track, ohms


class UnitAngle:
    def __init__(self, ao, vcc=5.0, r1=R1, r_pot=R_POT, samples=16, vref=3.3):
        """ao: GPIO wired to the Analog Output (white wire).
        vcc: voltage on the unit's 5V pin. vref: ADC full scale when read_uv() is missing (Pico)."""
        self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: needs the 0-3.3 V range for up to 2.5 V
        except AttributeError:
            pass
        self.vcc = vcc
        self.r1 = r1
        self.r_pot = r_pot
        self.samples = samples
        self.vref = vref

    def _read_v(self):
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def voltage(self):
        """Wiper voltage Uo in volts (averaged), 0 to about 2.5 V."""
        total = 0
        for _ in range(self.samples):
            total += self._read_v()
        return total / self.samples

    def resistance(self):
        """Wiper-to-GND resistance Rp in ohms, from Uo = Vcc * Rp / (Rp + R1)."""
        v = self.voltage()
        if v >= self.vcc - 0.001:
            return self.r_pot
        rp = self.r1 * v / (self.vcc - v)
        return 0.0 if rp < 0 else (self.r_pot if rp > self.r_pot else rp)

    def fraction(self):
        """Knob position 0.0 (GND end) to 1.0 (top end) = Rp / R2 (linear track)."""
        return self.resistance() / self.r_pot

    def percent(self):
        """Knob position in % of travel (0-100)."""
        return 100 * self.fraction()

    def raw(self):
        """Single raw ADC reading, 0-65535."""
        return self.adc.read_u16()
