# VNH2SP30-E full-bridge motor driver (ST), MicroPython driver.
# Written for the SparkFun Monster Moto Shield (DEV-10182): two VNH2SP30s, one per motor.
# Shield wiring (MonsterMoto-Shield-v12 schematic): INA, INB and PWM reach the chip through 1 kOhm series
# resistors, PWM also has a 1 kOhm pull-down; ENA/DIAGA and ENB/DIAGB are tied together and pulled up to the
# shield's 5V pin with 4.7 kOhm (EN1/EN2); CS feeds a 1.5 kOhm sense resistor to GND, then 10 kOhm + 33 nF.
#
# Truth table (ST datasheet Table 12, EN/DIAG high):
#   INA INB  OUTA OUTB  mode
#    1   1    H    H    brake to VCC
#    1   0    H    L    clockwise (CW)
#    0   1    L    H    counterclockwise (CCW)
#    0   0    L    L    brake to GND
# "A 0 on the PWM pin turns off both LSA and LSB" (datasheet section 3): PWM modulates the low-side switch, so
# speed = PWM duty, and INA = INB = 0 with PWM = 0 leaves every switch off (the motor coasts).
# PWM frequency: 0-20 kHz (datasheet Table 9); this driver uses 20 kHz by default.
# Logic thresholds: VIH 3.25 V min (2.7 V typical), VIL 1.25 V max. A 3.3 V GPIO is at the edge of the
# guaranteed range; for guaranteed operation put a 5 V buffer (e.g. 74AHCT125) in front of INA/INB/PWM.
#
# Current sense: I_sense = I_out / K, K = 11370 typ. (9665-13075 at 30 A, Table 11), into the shield's 1.5 kOhm
# resistor: 0.132 V per amp at the CS pin. CS is only valid in CW/CCW (high impedance while braking).
# Above about 25 A the CS pin exceeds 3.3 V, so feed a 3.3 V ADC through a divider (top -> ADC pin, bottom -> GND)
# and pass its resistors; the driver accounts for the shield's own 10 kOhm series resistor.
from machine import Pin, PWM, ADC

K_SENSE = 11370       # I_out / I_sense, datasheet typical
R_SENSE = 1500        # shield sense resistor (R6 / R15)
R_SERIES = 10000      # shield series resistor to the A2/A3 header (R5 / R14)


class VNH2SP30:
    def __init__(self, ina, inb, pwm, freq=20000, cs=None, cs_top=10000, cs_bottom=20000, vref=3.3, en=None):
        """ina, inb, pwm: GPIO numbers. cs: optional ADC GPIO on the CS line; cs_top/cs_bottom: the divider in
        front of it (cs_bottom=None when CS goes straight to the ADC). en: optional GPIO on EN/DIAG. It is pulled up
        to 5 V on the shield, so only wire it through a level shifter."""
        if freq > 20000:
            raise ValueError('VNH2SP30 PWM is limited to 20 kHz')
        self.ina = Pin(ina, Pin.OUT, value=0)
        self.inb = Pin(inb, Pin.OUT, value=0)
        self.pwm = PWM(Pin(pwm), freq=freq, duty_u16=0)
        self.cs = ADC(Pin(cs)) if cs is not None else None
        self.cs_top = cs_top
        self.cs_bottom = cs_bottom
        self.vref = vref
        self.en = Pin(en, Pin.IN) if en is not None else None

    @staticmethod
    def _duty(speed):
        speed = max(0, min(100, speed))
        return speed * 65535 // 100

    def cw(self, speed=100):
        """Clockwise: INA = 1, INB = 0 (OUTA high, OUTB low), PWM = speed %."""
        self.inb.value(0)
        self.ina.value(1)
        self.pwm.duty_u16(self._duty(speed))

    def ccw(self, speed=100):
        """Counterclockwise: INA = 0, INB = 1, PWM = speed %."""
        self.ina.value(0)
        self.inb.value(1)
        self.pwm.duty_u16(self._duty(speed))

    def drive(self, speed):
        """speed -100..100: positive = CW, negative = CCW, 0 = brake to GND."""
        if speed > 0:
            self.cw(speed)
        elif speed < 0:
            self.ccw(-speed)
        else:
            self.brake()

    def brake(self, strength=100):
        """Brake to GND: INA = INB = 0, both low sides on for `strength` % of the time (PWM)."""
        self.ina.value(0)
        self.inb.value(0)
        self.pwm.duty_u16(self._duty(strength))

    def brake_vcc(self):
        """Brake to VCC: INA = INB = 1, both high sides on."""
        self.ina.value(1)
        self.inb.value(1)
        self.pwm.duty_u16(65535)

    def coast(self):
        """INA = INB = 0 and PWM = 0: every switch off, the motor runs down freely."""
        self.ina.value(0)
        self.inb.value(0)
        self.pwm.duty_u16(0)

    def stop(self):
        self.brake()

    def fault(self):
        """True when the chip pulls EN/DIAG low (over-temperature or short), None without an EN pin.
        Clear a latched fault by taking INA/INB low and back high (datasheet section 3)."""
        if self.en is None:
            return None
        return self.en.value() == 0

    def current(self):
        """Approximate motor current in amps (only meaningful while driving CW/CCW), or None without a CS pin."""
        if self.cs is None:
            return None
        v_adc = self.cs.read_u16() * self.vref / 65535
        if self.cs_bottom is None:
            i_sense = v_adc / R_SENSE
        else:
            i_chain = v_adc / self.cs_bottom
            v_cs = i_chain * (R_SERIES + self.cs_top + self.cs_bottom)
            i_sense = v_cs / R_SENSE + i_chain
        return i_sense * K_SENSE


class MonsterMoto:
    """Both channels of the Monster Moto Shield: m1 = INA1/INB1/PWM1, m2 = INA2/INB2/PWM2."""

    def __init__(self, ina1, inb1, pwm1, ina2, inb2, pwm2, freq=20000, cs1=None, cs2=None, **kw):
        self.m1 = VNH2SP30(ina1, inb1, pwm1, freq=freq, cs=cs1, **kw)
        self.m2 = VNH2SP30(ina2, inb2, pwm2, freq=freq, cs=cs2, **kw)

    def stop(self):
        self.m1.brake()
        self.m2.brake()
