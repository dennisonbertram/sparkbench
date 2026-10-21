# BTS7960 43 A H-bridge motor driver module (IBT-2 type), MicroPython driver.
# The module holds two Infineon BTS7960B half bridges (one per motor terminal) behind a 74HC244 buffer:
#   RPWM -> IN of the "R" half bridge, R_EN -> its INH;  LPWM -> IN of the "L" half bridge, L_EN -> its INH.
# Half-bridge truth table (Infineon BTS7960 datasheet, 4.4.5):
#   INH = 0         -> both MOSFETs off (output floats, stand-by)
#   INH = 1, IN = 0 -> low-side MOSFET on (output pulled to GND)
#   INH = 1, IN = 1 -> high-side MOSFET on (output at the motor supply B+)
# So with both enables high: RPWM = PWM, LPWM = 0 -> forward; RPWM = 0, LPWM = PWM -> reverse;
# both low -> both low sides on = brake. Enables low -> both bridges off = coast.
# PWM up to 25 kHz (datasheet); the default 20 kHz is inaudible and inside that limit.
# RPWM and LPWM both high also brakes (both high sides on); this driver always brakes with both low.
# Current sense (optional): each IS pin sources I_load / kILIS (kILIS = 8500 typ.) into the module's 1 kOhm
# resistor to GND (IBT-2 schematic), so V_IS = I_load / 8.5 A, i.e. load current = 8.5 A per volt (datasheet 4.4.4).
# Only the side whose high-side switch is on reports (forward -> R_IS, reverse -> L_IS). Accuracy is rough
# (kILIS 3000-14000 at 5 A). In a fault IS sources 4-7 mA = 4-7 V: never wire IS straight to a 3.3 V ADC;
# use a divider and pass its ratio as is_divider (e.g. 10k over 20k -> is_divider=1.5).
from machine import Pin, PWM, ADC

AMPS_PER_VOLT = 8.5  # kILIS 8500 x 1 kOhm on-board IS resistor


class BTS7960:
    def __init__(self, rpwm, lpwm, r_en=None, l_en=None, freq=20000, r_is=None, l_is=None, is_divider=1.0, vref=3.3):
        """rpwm, lpwm: GPIO numbers wired to RPWM / LPWM.
        r_en, l_en: GPIO numbers wired to R_EN / L_EN, or None when they are tied to VCC.
        r_is, l_is: optional ADC GPIOs reading R_IS / L_IS through a divider (ratio is_divider = V_IS / V_ADC)."""
        self.r_is = ADC(Pin(r_is)) if r_is is not None else None
        self.l_is = ADC(Pin(l_is)) if l_is is not None else None
        self.is_divider = is_divider
        self.vref = vref
        self.r = PWM(Pin(rpwm), freq=freq, duty_u16=0)
        self.l = PWM(Pin(lpwm), freq=freq, duty_u16=0)
        self.r_en = Pin(r_en, Pin.OUT, value=0) if r_en is not None else None
        self.l_en = Pin(l_en, Pin.OUT, value=0) if l_en is not None else None

    @staticmethod
    def _duty(speed):
        speed = max(0, min(100, speed))
        return speed * 65535 // 100

    def enable(self, on=True):
        if self.r_en is not None:
            self.r_en.value(1 if on else 0)
        if self.l_en is not None:
            self.l_en.value(1 if on else 0)

    def forward(self, speed=100):
        """Spin one way: RPWM = speed %, LPWM = 0 (L side held to GND by its low-side MOSFET)."""
        self.l.duty_u16(0)
        self.r.duty_u16(self._duty(speed))
        self.enable(True)

    def reverse(self, speed=100):
        """Spin the other way: LPWM = speed %, RPWM = 0."""
        self.r.duty_u16(0)
        self.l.duty_u16(self._duty(speed))
        self.enable(True)

    def drive(self, speed):
        """speed -100..100: positive = forward, negative = reverse, 0 = brake."""
        if speed > 0:
            self.forward(speed)
        elif speed < 0:
            self.reverse(-speed)
        else:
            self.brake()

    def brake(self):
        """Both inputs low with the bridges enabled: both low sides on, the motor is shorted and stops fast."""
        self.r.duty_u16(0)
        self.l.duty_u16(0)
        self.enable(True)

    def coast(self):
        """Enables low: all MOSFETs off and the motor runs down freely. Needs R_EN/L_EN on GPIOs;
        otherwise it falls back to brake()."""
        self.r.duty_u16(0)
        self.l.duty_u16(0)
        if self.r_en is None and self.l_en is None:
            return
        self.enable(False)

    def stop(self):
        self.brake()

    def current(self):
        """Approximate motor current in amps from R_IS + L_IS (8.5 A per volt at the IS pin), or None
        when no IS pin was given. Rough: the sense ratio spreads widely at low current."""
        v = 0.0
        if self.r_is is None and self.l_is is None:
            return None
        for a in (self.r_is, self.l_is):
            if a is not None:
                v += a.read_u16() * self.vref / 65535 * self.is_divider
        return v * AMPS_PER_VOLT
