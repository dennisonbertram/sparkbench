# DFRobot Gravity: Analog Turbidity Sensor (SEN0189) and its clones, MicroPython driver.
# The probe shines infrared light across a gap; suspended particles scatter it, so less reaches the
# receiver. The adapter board's "A/D" pin, with the D/A switch on "A", gives an analog voltage
# (0-4.5 V on a 5 V supply) that FALLS as turbidity rises: about 4.1 +/- 0.3 V in clear water
# (< 0.5 NTU) at 10-50 C. With the switch on "D" the same pin is a digital output (threshold set
# on the trimmer); use digital() for that.
# NTU from voltage: DFRobot's fitted curve (wiki, "Voltage-turbidity" chart, about 25 C):
#     NTU = -1120.4 * V^2 + 5742.3 * V - 4352.9      valid for 2.5 V <= V <= 4.2 V (3000..0 NTU)
# The curve is typical only; each probe differs and the output drifts with temperature, so use
# calibrate() in clear water to shift your probe onto the curve.
from machine import ADC, Pin


def ntu_from_volts(v):
    """DFRobot SEN0189 curve. Clamped to its valid 2.5-4.2 V range (3000-0 NTU)."""
    if v >= 4.2:
        return 0.0
    if v <= 2.5:
        return 3000.0
    n = -1120.4 * v * v + 5742.3 * v - 4352.9
    return max(0.0, min(3000.0, n))


class Turbidity:
    def __init__(self, pin, divider=1.0, samples=32, vref=3.3):
        """pin: GPIO number (or Pin) wired to the board's A/D pin (switch on "A").
        divider: A/D-pin voltage / ADC-pin voltage if you fitted a resistor divider (the output reaches
        4.5 V, above a 3.3 V ADC's range: 10k in series and 20k to GND gives divider=1.5).
        vref: ADC full scale used when read_uv() is not available (e.g. Pico)."""
        self.pin = Pin(pin) if isinstance(pin, int) else pin
        self.adc = ADC(self.pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.divider = divider
        self.samples = samples
        self.vref = vref
        self.offset = 0.0

    def voltage(self):
        """Sensor output voltage in volts (before any divider), averaged over several samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate(self, clear_v=None, target_v=4.2):
        """Put the probe in clear (filtered or distilled) water and call this: the reading is shifted so
        clear water reads target_v (0 NTU on the curve). Returns the offset in volts."""
        if clear_v is None:
            clear_v = self.voltage()
        self.offset = target_v - clear_v
        return self.offset

    def ntu(self):
        """Turbidity in NTU from DFRobot's curve (0-3000 NTU, approximate)."""
        return ntu_from_volts(self.voltage() + self.offset)

    def digital(self):
        """Switch on "D" only: the pin's logic level (0 or 1). The level flips when the turbidity passes
        the trimmer's threshold (DFRobot's example lights an LED when it reads LOW). Use either this or
        voltage()/ntu() in one program, matching the switch position."""
        self.pin.init(Pin.IN)
        return self.pin.value()
