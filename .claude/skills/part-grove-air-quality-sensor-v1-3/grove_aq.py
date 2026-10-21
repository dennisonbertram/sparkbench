# Grove - Air Quality Sensor v1.3 (Seeed 101020078, Winsen MP503 sensor), MicroPython driver.
# Board circuit (Seeed v1.3 schematic): an SX1301 boost converter makes a 5.0 V rail (VCC_5V) from the
# Grove VCC for the MP503 heater (pins 1-2, RH = 95 ohm) and the LM358 op-amp. The MP503 sensing
# element (pins 3-4) runs from the Grove VCC itself to a 10 kOhm load resistor RL to GND, and the
# LM358, wired as a voltage follower, buffers the voltage across RL onto SIG.
# Per the MP503 datasheet test circuit (VRL across RL in series with the sensor, fed by Vc):
#   V(SIG) = VRL = Vc * RL / (Rs + RL)        Vc = the module's VCC, RL = 10 kOhm
#   Rs     = RL * (Vc / V(SIG) - 1)
# Target gases (alcohol, smoke, formaldehyde, CO...) raise the conductivity, so Rs falls and SIG rises.
# The datasheet's curves use Rs/R0 with R0 = resistance in clean air. They are typical only, so this
# driver gives the voltage, Rs and Rs/R0 (after calibrate() in clean air), not ppm.
from machine import ADC, Pin

RL = 10000  # load resistor R2 on the board (ohms)


class GroveAirQuality:
    def __init__(self, pin, vcc=3.3, vref=3.3, samples=16):
        """pin: ADC GPIO wired to SIG. vcc: the supply you feed the module (3.3 or 5.0 V); it is the
        Vc of the measuring circuit. vref: ADC full scale when read_uv() is missing (Pico: 3.3 V)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.vref = vref
        self.samples = samples
        self.r0 = None

    def volts(self):
        """V(SIG) in volts, averaged over several ADC samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self, v=None):
        """Sensor resistance Rs in ohms, Rs = RL * (Vc / V(SIG) - 1). None if SIG is ~0 V
        (sensor cold, unpowered or not wired)."""
        if v is None:
            v = self.volts()
        if v <= 0.005:
            return None
        if v >= self.vcc:
            return 0.0
        return RL * (self.vcc / v - 1)

    def calibrate(self, r0=None):
        """Store R0 (resistance in clean air). With no argument, use the current Rs: do this in
        clean air after the 48 h first-use aging and a few minutes of warm-up."""
        self.r0 = self.resistance() if r0 is None else r0
        return self.r0

    def ratio(self):
        """Rs/R0, the ordinate of the datasheet's sensitivity curve (falls as gas rises)."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        rs = self.resistance()
        return None if rs is None else rs / self.r0
