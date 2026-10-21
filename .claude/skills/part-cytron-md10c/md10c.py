# Cytron MD10C R3.0 13 A DC motor driver, MicroPython driver.
# One H-bridge (4 NMOS), one brushed DC motor, powered from the motor supply only (5-30 V).
# Control header (Cytron MD10C R3.0 user's manual, section 3G): 1 GND, 2 PWM, 3 DIR.
# Truth table (same section):
#   PWM = 0, DIR = X -> A low,  B low : brake (low-side)
#   PWM = 1, DIR = 0 -> A high, B low : forward (current A -> B)
#   PWM = 1, DIR = 1 -> A low,  B high: reverse (current B -> A)
# Sign-magnitude PWM: PWM pin carries the speed duty, DIR selects the direction.
# The off part of each PWM period brakes (slow decay), so speed is roughly proportional to duty.
# PWM frequency at most 20 kHz (output frequency = input frequency); 10 kHz default.
# Inputs: high 3-5.5 V, low 0-0.5 V, so 3.3 V GPIOs drive them directly.
# (Locked-antiphase mode, PWM held high and the PWM signal on DIR with 50 % = stop, is also supported by the
#  board; this driver uses sign-magnitude.)
from machine import Pin, PWM

MAX_FREQ = 20000


class MD10C:
    def __init__(self, pwm, dir, freq=10000):
        """pwm, dir: GPIO numbers wired to the PWM and DIR header pins. freq: PWM frequency, <= 20 kHz."""
        if freq > MAX_FREQ:
            raise ValueError('MD10C PWM frequency must be <= 20 kHz')
        self.dir = Pin(dir, Pin.OUT, value=0)
        self.pwm = PWM(Pin(pwm), freq=freq, duty_u16=0)

    @staticmethod
    def _duty(speed):
        speed = max(0, min(100, speed))
        return speed * 65535 // 100

    def forward(self, speed=100):
        """DIR low, PWM = speed %: output A high, B low while PWM is high."""
        self.pwm.duty_u16(0)
        self.dir.value(0)
        self.pwm.duty_u16(self._duty(speed))

    def reverse(self, speed=100):
        """DIR high, PWM = speed %: output A low, B high while PWM is high."""
        self.pwm.duty_u16(0)
        self.dir.value(1)
        self.pwm.duty_u16(self._duty(speed))

    def drive(self, speed):
        """speed -100..100: positive = forward, negative = reverse, 0 = brake."""
        if speed > 0:
            self.forward(speed)
        elif speed < 0:
            self.reverse(-speed)
        else:
            self.brake()

    def brake(self):
        """PWM low: both outputs low, the motor is shorted and stops quickly. (The MD10C has no coast state.)"""
        self.pwm.duty_u16(0)

    def stop(self):
        self.brake()
