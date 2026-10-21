# MX1508 dual brushed-DC motor driver (Mixic MX1508), MicroPython driver for ONE channel (one DC motor).
# Make one MX1508 object per motor: on the red module, motor A = IN1, IN2; motor B = IN3, IN4.
# Logic truth table from the MX1508 datasheet (INAx, INBx -> OUTAx, OUTBx):
#   L, L -> Z, Z   standby: outputs off, motor coasts (also the state with inputs left open:
#                  each input has an internal pull-down of about 15 kOhm)
#   H, L -> H, L   forward
#   L, H -> L, H   reverse
#   H, H -> L, L   brake (motor shorted through the low-side MOSFETs)
# Speed (datasheet "PWM mode B", recommended): hold one input high and PWM the other; the bridge
# switches between driving and braking, so speed follows the duty cycle closely. Forward = INA high,
# PWM on INB; the motor is driven while INB is LOW, so INB's duty is (100 - speed) %.
# The datasheet recommends a PWM frequency of 10-50 kHz for mode B.
# "PWM mode A" (PWM one input, the other low; drive/standby, fast decay) is available with decay='fast',
# but the datasheet notes speed is not accurately set by the duty cycle in this mode.
# Inputs: high >= 0.6 x VCC, low <= 0.6 V, never above VCC.
from machine import Pin, PWM


class MX1508:
    def __init__(self, in_a, in_b, freq=20000, decay='slow'):
        """in_a, in_b: GPIO numbers wired to the channel's two inputs (IN1/IN2 or IN3/IN4).
        freq: PWM frequency for speed control (datasheet: 10-50 kHz).
        decay: 'slow' (PWM mode B, default) or 'fast' (PWM mode A)."""
        self._na = in_a
        self._nb = in_b
        self._freq = freq
        self._decay = decay
        self._pwm = None
        self._a = Pin(in_a, Pin.OUT, value=0)
        self._b = Pin(in_b, Pin.OUT, value=0)

    def _release_pwm(self):
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
            self._a = Pin(self._na, Pin.OUT, value=0)
            self._b = Pin(self._nb, Pin.OUT, value=0)

    def _set(self, va, vb):
        self._release_pwm()
        self._a.value(va)
        self._b.value(vb)

    def _run(self, drive_pin, other_pin, speed, forward):
        # drive_pin is the input that is HIGH for this direction (INA forward, INB reverse).
        speed = max(0, min(100, speed))
        if speed >= 100:
            if forward:
                self._set(1, 0)
            else:
                self._set(0, 1)
            return
        if speed <= 0:
            self.coast()
            return
        self._release_pwm()
        if self._decay == 'fast':
            # Mode A: other input low, PWM the driving input, duty = speed.
            Pin(other_pin, Pin.OUT, value=0)
            self._pwm = PWM(Pin(drive_pin), freq=self._freq, duty_u16=speed * 65535 // 100)
        else:
            # Mode B: driving input held high, PWM the other one; it brakes while high.
            Pin(drive_pin, Pin.OUT, value=1)
            self._pwm = PWM(Pin(other_pin), freq=self._freq, duty_u16=(100 - speed) * 65535 // 100)

    def forward(self, speed=100):
        """OUTA high, OUTB low. speed 0-100 %."""
        self._run(self._na, self._nb, speed, True)

    def reverse(self, speed=100):
        """OUTA low, OUTB high. speed 0-100 %."""
        self._run(self._nb, self._na, speed, False)

    def drive(self, speed):
        """Signed speed -100..100: positive = forward, negative = reverse, 0 = coast."""
        if speed >= 0:
            self.forward(speed)
        else:
            self.reverse(-speed)

    def brake(self):
        """Both inputs high: both outputs low, the motor stops quickly."""
        self._set(1, 1)

    def coast(self):
        """Both inputs low: standby, outputs high-impedance, the motor spins down freely."""
        self._set(0, 0)

    def stop(self):
        self.coast()
