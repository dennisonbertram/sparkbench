# KY-023 dual-axis analog joystick module, MicroPython driver.
# The module is two 10 kOhm potentiometers (wipers on VRx / VRy, ends on +5V and GND) plus a
# push switch from SW to GND (no pull-up fitted). Each wiper voltage is ratiometric:
#   Vout = position * Vcc   (about Vcc / 2 at rest)
# so position(%) = 100 * Vout / Vcc. Power the module from the same 3.3 V rail as the ADC.
from machine import ADC, Pin


class KY023:
    def __init__(self, vrx, vry, sw=None, vcc=3.3, samples=16):
        self.x_adc = self._adc(vrx)
        self.y_adc = self._adc(vry)
        # SW only shorts to GND when pressed: use the MCU's internal pull-up.
        self.sw = Pin(sw, Pin.IN, Pin.PULL_UP) if sw is not None else None
        self.vcc = vcc  # supply voltage on the module's +5V pin (3.3 V recommended)
        self.samples = samples

    @staticmethod
    def _adc(pin):
        adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            adc.atten(ADC.ATTN_11DB)  # ESP32: 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        return adc

    def _fraction(self, adc):
        """Average samples; return wiper voltage as a fraction of Vcc (0.0-1.0)."""
        total = 0
        if hasattr(adc, 'read_uv'):
            for _ in range(self.samples):
                total += adc.read_uv() / 1e6 / self.vcc
        else:
            # Pico etc.: ADC reference is the 3.3 V rail, so the raw reading is already ratiometric.
            for _ in range(self.samples):
                total += adc.read_u16() / 65535
        f = total / self.samples
        return 0.0 if f < 0 else 1.0 if f > 1 else f

    def x(self):
        """X position in % of travel (0-100, about 50 at rest)."""
        return 100 * self._fraction(self.x_adc)

    def y(self):
        """Y position in % of travel (0-100, about 50 at rest)."""
        return 100 * self._fraction(self.y_adc)

    def xy_centered(self, deadzone=5):
        """(x, y) from -100 to +100 with 0 at rest; values within deadzone become 0."""
        out = []
        for v in (self.x(), self.y()):
            c = (v - 50) * 2
            out.append(0 if abs(c) < deadzone else c)
        return tuple(out)

    def pressed(self):
        """True while the stick is pushed down (SW pulled to GND)."""
        return self.sw is not None and self.sw.value() == 0
