# Grove - Round Force Sensor (FSR402), MicroPython driver.
# Board circuit (Seeed schematic): an XC6206P332 LDO makes 3.3 V from VCC; the Interlink FSR 402
# runs from that 3.3 V rail to a 30 kOhm measuring resistor (RM) to GND, and a TLV521 op-amp
# wired as a voltage follower buffers the divider onto SIG. Per the FSR 400 Series datasheet:
#   V(SIG) = RM * V+ / (RM + RFSR)          RM = 30 kOhm, V+ = 3.3 V
#   RFSR   = RM * (V+ / V(SIG) - 1)
# SIG rises with force: about 0 V unpressed (RFSR > 10 MOhm), towards 3.3 V when pressed hard.
# The force-to-resistance relation varies between parts (+/-6 % part to part, +10 % hysteresis, and
# it depends on how the force is applied), so force_g() is only a rough estimate fitted to the
# datasheet's typical curve (about 10 kOhm at 150 g, 2.5 kOhm at 1 kg). Calibrate for real weighing.
from machine import ADC, Pin

RM = 30000      # measuring resistor on the board (ohms)
VPLUS = 3.3     # divider supply: the board's own 3.3 V LDO, whatever VCC is


class FSR402:
    def __init__(self, pin, vref=3.3, samples=16):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vref = vref  # ADC full scale when read_uv() is not available (Pico: 3.3 V)
        self.samples = samples

    def volts(self):
        """Average several samples and return V(SIG) in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self, v=None):
        """FSR resistance in ohms from the divider formula, or None when not pressed (V(SIG) < 10 mV)."""
        if v is None:
            v = self.volts()
        if v < 0.01:
            return None
        if v >= VPLUS:
            return 0.0
        return RM * (VPLUS / v - 1)

    def pressed(self, threshold_v=0.2):
        """True when V(SIG) is above threshold_v (about 470 kOhm, i.e. a light touch)."""
        return self.volts() > threshold_v

    def force_g(self, r=None):
        """Rough force in grams from the datasheet's typical curve, or 0 when not pressed.
        Only meaningful over about 20 g - 2 kg; individual sensors can differ a lot."""
        if r is None:
            r = self.resistance()
        if r is None:
            return 0
        if r <= 0:
            return 2000
        return 150 * (10000 / r) ** 1.37
