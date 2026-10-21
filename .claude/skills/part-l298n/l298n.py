# L298N dual H-bridge motor driver (ST L298), MicroPython driver for ONE bridge (one DC motor).
# Make one L298N object per motor: bridge A = IN1, IN2, ENA; bridge B = IN3, IN4, ENB.
# Truth table from the ST L298 datasheet (Fig. 6, bidirectional DC motor control):
#   EN = H, C = H, D = L  -> forward
#   EN = H, C = L, D = H  -> reverse
#   EN = H, C = D         -> fast motor stop (brake)
#   EN = L, C/D = X       -> free-running motor stop (coast)
# Inputs are TTL: low <= 1.5 V, high >= 2.3 V, so 3.3 V GPIOs drive them directly.
# Speed: PWM the EN pin (remove the ENA/ENB jumper). The L298 commutation frequency is 25 kHz typ.,
# 40 kHz max, so the default 1 kHz is well inside the limit.
from machine import Pin, PWM


class L298N:
    def __init__(self, in_a, in_b, en=None, freq=1000):
        """in_a, in_b: GPIO numbers of the bridge's IN pins (IN1/IN2 or IN3/IN4).
        en: GPIO number of ENA/ENB, or None when the module's enable jumper is fitted (always full speed)."""
        self.a = Pin(in_a, Pin.OUT, value=0)
        self.b = Pin(in_b, Pin.OUT, value=0)
        self.pwm = None
        if en is not None:
            self.pwm = PWM(Pin(en), freq=freq, duty_u16=0)

    def _enable(self, speed):
        if self.pwm is not None:
            speed = max(0, min(100, speed))
            self.pwm.duty_u16(speed * 65535 // 100)

    def forward(self, speed=100):
        """Spin one way (IN_a high, IN_b low). speed 0-100 % needs the EN pin."""
        self.a.value(1)
        self.b.value(0)
        self._enable(speed)

    def reverse(self, speed=100):
        """Spin the other way (IN_a low, IN_b high)."""
        self.a.value(0)
        self.b.value(1)
        self._enable(speed)

    def brake(self):
        """Fast motor stop: both inputs equal with the bridge enabled."""
        self.a.value(0)
        self.b.value(0)
        self._enable(100)

    def coast(self):
        """Free-running stop: EN low. Without an EN pin (jumper fitted) this falls back to brake()."""
        self.a.value(0)
        self.b.value(0)
        if self.pwm is not None:
            self.pwm.duty_u16(0)

    def stop(self):
        self.brake()
