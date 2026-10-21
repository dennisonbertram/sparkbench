# Adafruit analog 2-axis thumb joystick with select button (product 512), MicroPython driver.
# The breakout holds no chip: two 10 kOhm potentiometers (ends on Vcc and GND, wipers on
# Xout / Yout) and a select switch that shorts Sel to GND when the stick is pressed
# (no pull-up on the board). Each wiper voltage is ratiometric:
#   Vout = position * Vcc   (about Vcc / 2 at rest)
# so position(%) = 100 * Vout / Vcc. Power the board from the same 3.3 V rail as the ADC.
from machine import ADC, Pin


class ThumbJoystick:
    def __init__(self, xout, yout, sel=None, vcc=3.3, samples=16):
        self.x_adc = self._adc(xout)
        self.y_adc = self._adc(yout)
        # Sel only shorts to GND when pressed: use the MCU's internal pull-up.
        self.sel = Pin(sel, Pin.IN, Pin.PULL_UP) if sel is not None else None
        self.vcc = vcc  # voltage on the board's Vcc pin (3.3 V with a 3.3 V MCU)
        self.samples = samples

    @staticmethod
    def _adc(pin):
        adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        return adc

    def _fraction(self, adc):
        """Average samples; return the wiper voltage as a fraction of Vcc (0.0-1.0)."""
        total = 0
        if hasattr(adc, 'read_uv'):
            # ESP32: calibrated microvolts, divide by the supply voltage.
            for _ in range(self.samples):
                total += adc.read_uv() / 1e6 / self.vcc
        else:
            # Pico etc.: the ADC reference is the 3.3 V rail, so the raw reading is ratiometric.
            for _ in range(self.samples):
                total += adc.read_u16() / 65535
        f = total / self.samples
        return 0.0 if f < 0 else 1.0 if f > 1 else f

    def x(self):
        """Xout position in % of travel (0-100, about 50 at rest)."""
        return 100 * self._fraction(self.x_adc)

    def y(self):
        """Yout position in % of travel (0-100, about 50 at rest)."""
        return 100 * self._fraction(self.y_adc)

    def xy_centered(self, deadzone=5):
        """(x, y) from -100 to +100 with 0 at rest; values within deadzone become 0."""
        out = []
        for v in (self.x(), self.y()):
            c = (v - 50) * 2
            out.append(0 if abs(c) < deadzone else c)
        return tuple(out)

    def pressed(self):
        """True while the stick is pushed down (Sel shorted to GND)."""
        return self.sel is not None and self.sel.value() == 0
