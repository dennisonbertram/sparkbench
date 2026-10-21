# Seeed Grove - Thumb Joystick v1.1 (SKU 101020028), MicroPython driver.
# Circuit (Seeed schematic, Joystick.sch): a PS2-style stick (U2 "PSROCKER") with two 10 kOhm
# potentiometers. Each track has a 4.7 kOhm resistor in series at both ends (R6/R1 for X,
# R3/R5 for Y), so the wipers never reach the rails:
#   X (Grove pin 1, OUT_X) and Y (Grove pin 2, OUT_Y) swing about 0.2 x VCC .. 0.78 x VCC.
# Seeed's specification (10-bit ADC at VCC): X 206 / 516 / 798, Y 203 / 507 / 797 (min / typ / max).
# The push switch (A1-A2 to B1-B2) shorts OUT_X straight to VCC, so a click reads X = VCC
# (Seeed: "only when being pressed the X value will be set to 1023").
# Everything is ratiometric to VCC: power the module from the same 3.3 V rail as the ADC.
from machine import ADC, Pin

# Seeed spec table, as fractions of VCC (10-bit counts / 1023).
X_MIN, X_MAX = 206 / 1023, 798 / 1023
Y_MIN, Y_MAX = 203 / 1023, 797 / 1023
PRESS_FRACTION = 900 / 1023  # Seeed's grove.py treats X > 900 as pressed; normal travel tops out at 798


class GroveThumbJoystick:
    def __init__(self, x_pin, y_pin, vcc=3.3, vref=3.3, samples=16):
        self.x_adc = self._adc(x_pin)
        self.y_adc = self._adc(y_pin)
        self.vcc = vcc      # voltage on the module's VCC pin
        self.vref = vref    # ADC full scale when read_uv() is not available (e.g. Pico)
        self.samples = samples
        self.x_cal = (X_MIN, X_MAX)
        self.y_cal = (Y_MIN, Y_MAX)

    @staticmethod
    def _adc(pin):
        adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        return adc

    def _volts(self, adc):
        total = 0
        if hasattr(adc, 'read_uv'):
            for _ in range(self.samples):
                total += adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += adc.read_u16() * self.vref / 65535
        return total / self.samples

    def x_volts(self):
        """X (OUT_X) voltage in volts."""
        return self._volts(self.x_adc)

    def y_volts(self):
        """Y (OUT_Y) voltage in volts."""
        return self._volts(self.y_adc)

    def x_fraction(self):
        """X voltage as a fraction of VCC (about 0.2-0.78 moving, 1.0 when clicked)."""
        return self.x_volts() / self.vcc

    def y_fraction(self):
        """Y voltage as a fraction of VCC (about 0.2-0.78)."""
        return self.y_volts() / self.vcc

    @staticmethod
    def _pos(f, cal):
        lo, hi = cal
        p = 100 * (f - lo) / (hi - lo)
        return 0.0 if p < 0 else 100.0 if p > 100 else p

    def pressed(self):
        """True while the stick is pushed down (the switch ties X to VCC)."""
        return self.x_fraction() > PRESS_FRACTION

    def x(self):
        """X position in % of travel (0-100, about 52 at rest). Returns None while clicked,
        because the click overrides the X reading."""
        f = self.x_fraction()
        if f > PRESS_FRACTION:
            return None
        return self._pos(f, self.x_cal)

    def y(self):
        """Y position in % of travel (0-100, about 51 at rest)."""
        return self._pos(self.y_fraction(), self.y_cal)

    def calibrate(self, x_min, x_max, y_min, y_max):
        """Replace the Seeed typical end points with your own (fractions of VCC)."""
        self.x_cal = (x_min, x_max)
        self.y_cal = (y_min, y_max)
