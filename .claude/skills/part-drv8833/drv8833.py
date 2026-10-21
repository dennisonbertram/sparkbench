# DRV8833 dual H-bridge motor driver (TI DRV8833), MicroPython driver for ONE bridge (one DC motor).
# Make one DRV8833 object per motor: bridge A = AIN1, AIN2; bridge B = BIN1, BIN2.
# H-bridge logic from the TI datasheet (SLVSAR1E, Table 1):
#   xIN1 = 0, xIN2 = 0 -> outputs Hi-Z: coast / fast decay
#   xIN1 = 0, xIN2 = 1 -> reverse
#   xIN1 = 1, xIN2 = 0 -> forward
#   xIN1 = 1, xIN2 = 1 -> brake / slow decay
# Speed control (Table 2), slow decay: forward = xIN1 high + PWM on xIN2, reverse = PWM on xIN1 + xIN2 high.
# In slow decay the motor is driven while the PWM pin is LOW, so the PWM duty is (100 - speed) %.
# Inputs: high >= 2 V, low <= 0.7 V, max 5.75 V, so 3.3 V GPIOs work. nSLEEP (SLP) needs >= 2.5 V and
# has a 500 kOhm pull-down: the chip sleeps (outputs off) until SLP is driven high; it needs up to 1 ms to wake.
from machine import Pin, PWM
import time


class DRV8833:
    def __init__(self, in1, in2, slp=None, freq=20000):
        """in1, in2: GPIO numbers of the bridge's inputs (AIN1/AIN2 or BIN1/BIN2).
        slp: GPIO number wired to SLP (nSLEEP), or None if SLP is tied high elsewhere.
        freq: PWM frequency for speed control (20 kHz is above hearing)."""
        self._n1 = in1
        self._n2 = in2
        self._freq = freq
        self._pwm = None
        self.a = Pin(in1, Pin.OUT, value=0)
        self.b = Pin(in2, Pin.OUT, value=0)
        self.slp = None
        if slp is not None:
            self.slp = Pin(slp, Pin.OUT, value=0)
            self.wake()

    def wake(self):
        """Drive nSLEEP high and wait the 1 ms start-up time (tWAKE)."""
        if self.slp is not None:
            self.slp.value(1)
            time.sleep_ms(1)

    def sleep(self):
        """nSLEEP low: H-bridges off, about 1.6 uA from VM. Shared by both bridges on the board."""
        if self.slp is not None:
            self.slp.value(0)

    def _digital(self, v1, v2):
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
            self.a = Pin(self._n1, Pin.OUT)
            self.b = Pin(self._n2, Pin.OUT)
        self.a.value(v1)
        self.b.value(v2)

    def _slow_decay(self, high_pin, pwm_pin, speed):
        # high_pin held at 1, pwm_pin low for `speed` % of each period (driving), high otherwise (braking).
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
        """Spin one way (xOUT1 high, xOUT2 low). speed 0-100 %."""
        if not self._slow_decay(self._n1, self._n2, speed):
            self._digital(1, 0)

    def reverse(self, speed=100):
        """Spin the other way (xOUT1 low, xOUT2 high). speed 0-100 %."""
        if not self._slow_decay(self._n2, self._n1, speed):
            self._digital(0, 1)

    def brake(self):
        """Both inputs high: both outputs low, the motor is shorted and stops quickly."""
        self._digital(1, 1)

    def coast(self):
        """Both inputs low: outputs Hi-Z, the motor spins down freely."""
        self._digital(0, 0)

    def stop(self):
        self.brake()


def fault(pin_no):
    """True while FLT (nFAULT, open-drain, low on overcurrent/overtemperature/undervoltage) is asserted.
    Uses the GPIO's internal pull-up; the Adafruit board has no pull-up on FLT."""
    return Pin(pin_no, Pin.IN, Pin.PULL_UP).value() == 0
