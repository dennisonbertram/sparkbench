# DRV8871 3.6 A brushed DC motor driver (TI DRV8871), MicroPython driver.
# One H-bridge, one DC motor. H-bridge logic from the TI datasheet (SLVSCY9B, Table 1):
#   IN1 = 0, IN2 = 0 -> OUT1/OUT2 Hi-Z: coast (the chip sleeps after tSLEEP, about 1 ms)
#   IN1 = 0, IN2 = 1 -> OUT1 L, OUT2 H: reverse (current OUT2 -> OUT1)
#   IN1 = 1, IN2 = 0 -> OUT1 H, OUT2 L: forward (current OUT1 -> OUT2)
#   IN1 = 1, IN2 = 1 -> both L: brake (low-side slow decay)
# Speed (datasheet 7.3.1): switch between driving and braking, e.g. forward = IN1 held high, IN2 PWM;
# the motor is driven while IN2 is LOW, so the IN2 duty is (100 - speed) %.
# Inputs: high >= 1.5 V, low <= 0.5 V, max 5.5 V, 100 kOhm pull-downs; PWM up to 200 kHz (20 kHz default).
# There is no sleep pin: both inputs low for ~1 ms = sleep; a high input wakes it within 50 us (tON).
from machine import Pin, PWM


class DRV8871:
    def __init__(self, in1, in2, freq=20000):
        """in1, in2: GPIO numbers wired to IN1 / IN2. freq: PWM frequency for speed control (<= 200 kHz)."""
        self._n1 = in1
        self._n2 = in2
        self._freq = freq
        self._pwm = None
        self.a = Pin(in1, Pin.OUT, value=0)
        self.b = Pin(in2, Pin.OUT, value=0)

    def _digital(self, v1, v2):
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
            self.a = Pin(self._n1, Pin.OUT)
            self.b = Pin(self._n2, Pin.OUT)
        self.a.value(v1)
        self.b.value(v2)

    def _slow_decay(self, high_pin, pwm_pin, speed):
        # high_pin held at 1; pwm_pin low (driving) for `speed` % of each period, high (braking) otherwise.
        speed = max(0, min(100, speed))
        if speed >= 100:
            return False
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
        Pin(high_pin, Pin.OUT, value=1)
        self._pwm = PWM(Pin(pwm_pin), freq=self._freq, duty_u16=(100 - speed) * 65535 // 100)
        return True

    def forward(self, speed=100):
        """OUT1 high, OUT2 low. speed 0-100 %."""
        if not self._slow_decay(self._n1, self._n2, speed):
            self._digital(1, 0)

    def reverse(self, speed=100):
        """OUT1 low, OUT2 high. speed 0-100 %."""
        if not self._slow_decay(self._n2, self._n1, speed):
            self._digital(0, 1)

    def drive(self, speed):
        """speed -100..100: positive = forward, negative = reverse, 0 = brake."""
        if speed > 0:
            self.forward(speed)
        elif speed < 0:
            self.reverse(-speed)
        else:
            self.brake()

    def brake(self):
        """Both inputs high: both outputs low, the motor is shorted and stops quickly."""
        self._digital(1, 1)

    def coast(self):
        """Both inputs low: outputs Hi-Z, the motor spins down freely; the chip sleeps after ~1 ms."""
        self._digital(0, 0)

    def stop(self):
        self.brake()
