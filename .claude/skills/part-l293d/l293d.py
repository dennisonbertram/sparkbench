# L293D quadruple half-H driver (TI L293D / ST L293D), MicroPython driver for ONE H-bridge (one DC motor).
# Two half-H drivers that share an enable form one bridge:
#   bridge 1: inputs 1A (pin 2) and 2A (pin 7), enable 1,2EN (pin 1), motor on 1Y (pin 3) / 2Y (pin 6)
#   bridge 2: inputs 3A (pin 10) and 4A (pin 15), enable 3,4EN (pin 9), motor on 3Y (pin 11) / 4Y (pin 14)
# Function table (TI SLRS008D, Table 1, each driver): EN = H, A = H -> Y = H; EN = H, A = L -> Y = L;
# EN = L -> Y = Z (high impedance). So for one bridge:
#   EN = H, A1 = H, A2 = L  -> forward
#   EN = H, A1 = L, A2 = H  -> reverse
#   EN = H, A1 = A2         -> fast motor stop (brake: both motor leads at the same level)
#   EN = L                  -> outputs off, the motor coasts to a stop
# Inputs are TTL compatible: low <= 1.5 V, high >= 2.3 V, so 3.3 V GPIOs drive them directly.
# Speed: PWM the enable pin (a few kHz or less; the outputs switch in about 1 us).
from machine import Pin, PWM


class L293D:
    def __init__(self, in_a, in_b, en=None, freq=1000):
        """in_a, in_b: GPIO numbers wired to the bridge's A inputs (1A/2A or 3A/4A).
        en: GPIO number wired to 1,2EN or 3,4EN, or None when that enable pin is tied to 5 V (always on)."""
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
        """Spin one way (A1 high, A2 low). speed 0-100 % needs the enable pin on a GPIO."""
        self.a.value(1)
        self.b.value(0)
        self._enable(speed)

    def reverse(self, speed=100):
        """Spin the other way (A1 low, A2 high)."""
        self.a.value(0)
        self.b.value(1)
        self._enable(speed)

    def brake(self):
        """Fast motor stop: both inputs low with the drivers enabled (both motor leads pulled to GND)."""
        self.a.value(0)
        self.b.value(0)
        self._enable(100)

    def coast(self):
        """Free-running stop: enable low, outputs high impedance. Without an enable GPIO this falls back to brake()."""
        self.a.value(0)
        self.b.value(0)
        if self.pwm is not None:
            self.pwm.duty_u16(0)

    def stop(self):
        self.coast()
