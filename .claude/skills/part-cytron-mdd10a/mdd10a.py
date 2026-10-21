# Cytron MDD10A (Rev2.0) dual-channel 10 A DC motor driver, MicroPython driver.
# Written from the Cytron MDD10A User's Manual V2.0 (June 2017).
# Each channel has a PWM input (speed) and a DIR input (direction). Truth table (manual section 5, item 6):
#   PWM low            -> Output A low,  Output B low   (both low = motor terminals shorted: brake)
#   PWM high, DIR low  -> Output A high, Output B low   (current A -> B)
#   PWM high, DIR high -> Output A low,  Output B high  (current B -> A)
# This is sign-magnitude PWM: duty on PWM = speed, DIR = direction. PWM up to 20 kHz (TTL PWM only, not RC
# servo pulses). Logic high 3-5.5 V, low 0-0.5 V, so 3.3 V GPIOs drive it directly.
# Locked-antiphase (PWM pin held high, PWM on DIR, 50 % = stop) is also supported by the board; see
# LockedAntiphase below.
from machine import Pin, PWM

MAX_FREQ = 20000  # manual: maximum PWM frequency 20 kHz


class Motor:
    """One MDD10A channel: pwm = GPIO wired to PWMn, dir = GPIO wired to DIRn."""

    def __init__(self, pwm, dir, freq=MAX_FREQ):
        if freq > MAX_FREQ:
            raise ValueError('MDD10A PWM frequency is at most 20 kHz')
        self.dir = Pin(dir, Pin.OUT, value=0)
        self.pwm = PWM(Pin(pwm), freq=freq, duty_u16=0)

    def speed(self, s):
        """s from -100 to 100 (%). Positive: DIR low, current flows Output A -> B.
        Negative: DIR high, current flows B -> A. 0: brake (both outputs low)."""
        s = max(-100, min(100, s))
        if s == 0:
            self.pwm.duty_u16(0)
            return
        self.dir.value(0 if s > 0 else 1)
        self.pwm.duty_u16(abs(s) * 65535 // 100)

    def forward(self, s=100):
        self.speed(abs(s))

    def reverse(self, s=100):
        self.speed(-abs(s))

    def brake(self):
        """PWM low: both outputs low, the motor is shorted through the low-side MOSFETs and stops fast.
        (The MDD10A has no coast/high-impedance state.)"""
        self.pwm.duty_u16(0)

    stop = brake


class LockedAntiphase:
    """Locked-antiphase mode for one channel: PWMn held high, PWM fed to DIRn.
    50 % duty = stop, below 50 % one way (Output A -> B), above 50 % the other way."""

    def __init__(self, pwm, dir, freq=MAX_FREQ):
        if freq > MAX_FREQ:
            raise ValueError('MDD10A PWM frequency is at most 20 kHz')
        self.en = Pin(pwm, Pin.OUT, value=0)
        self.dir = PWM(Pin(dir), freq=freq, duty_u16=32768)
        self.en.value(1)

    def speed(self, s):
        """s from -100 to 100 (%): positive = DIR mostly low = current A -> B."""
        s = max(-100, min(100, s))
        self.dir.duty_u16((100 - s) * 65535 // 200)

    def stop(self):
        self.speed(0)


class MDD10A:
    """Both channels: MDD10A(pwm1, dir1, pwm2, dir2). Channel 2 pins are optional."""

    def __init__(self, pwm1, dir1, pwm2=None, dir2=None, freq=MAX_FREQ):
        self.m1 = Motor(pwm1, dir1, freq)
        self.m2 = Motor(pwm2, dir2, freq) if pwm2 is not None and dir2 is not None else None

    def drive(self, s1, s2=0):
        self.m1.speed(s1)
        if self.m2 is not None:
            self.m2.speed(s2)

    def brake(self):
        self.m1.brake()
        if self.m2 is not None:
            self.m2.brake()

    stop = brake
