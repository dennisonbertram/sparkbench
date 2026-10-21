# TB6612FNG dual DC motor driver (Toshiba), MicroPython driver for ONE channel (one DC motor).
# Make one TB6612FNG object per motor: channel A = AIN1, AIN2, PWMA; channel B = BIN1, BIN2, PWMB.
# Both channels share STBY: pass the same STBY pin to both, or tie STBY to VCC on the board.
# H-SW control function (Toshiba datasheet, page 4), STBY = H:
#   IN1 = H, IN2 = L, PWM = H -> CW   (OUT1 = H, OUT2 = L)
#   IN1 = L, IN2 = H, PWM = H -> CCW  (OUT1 = L, OUT2 = H)
#   IN1 = H, IN2 = H          -> short brake (OUT1 = OUT2 = L)
#   IN1 or IN2 high, PWM = L  -> short brake (so PWM gives "drive / brake" speed control)
#   IN1 = L, IN2 = L, PWM = H -> stop: outputs off (high impedance), motor coasts
#   STBY = L                  -> standby: outputs off, < 1 uA supply current
# Every input (IN1, IN2, PWM, STBY) has an internal 200 kOhm pull-down, so the motor is off while
# the GPIOs float. Input high >= 0.7 x VCC: run VCC from the same 3.3 V as the microcontroller.
# PWM frequency: up to 100 kHz (datasheet fPWM max); 20 kHz is above hearing range.
from machine import Pin, PWM


class TB6612FNG:
    def __init__(self, in1, in2, pwm, stby=None, freq=20000):
        """in1, in2, pwm: GPIO numbers of AIN1/AIN2/PWMA (or BIN1/BIN2/PWMB).
        stby: GPIO number wired to STBY, or None if STBY is tied to VCC."""
        self.in1 = Pin(in1, Pin.OUT, value=0)
        self.in2 = Pin(in2, Pin.OUT, value=0)
        self.pwm = PWM(Pin(pwm), freq=min(freq, 100000), duty_u16=0)
        self.stby = Pin(stby, Pin.OUT, value=1) if stby is not None else None

    def wake(self):
        """Leave standby (STBY high)."""
        if self.stby is not None:
            self.stby.value(1)

    def standby(self):
        """Standby (STBY low): both channels off, chip draws < 1 uA. Shared by channels A and B."""
        if self.stby is not None:
            self.stby.value(0)

    def drive(self, speed):
        """speed -100..100 %: positive = CW (OUT1 high), negative = CCW (OUT2 high), 0 = stop (coast)."""
        speed = max(-100, min(100, int(speed)))
        if speed == 0:
            self.stop()
            return
        self.wake()
        # Set direction first, then duty: PWM low phases give short brake, high phases drive.
        if speed > 0:
            self.in2.value(0)
            self.in1.value(1)
        else:
            self.in1.value(0)
            self.in2.value(1)
        self.pwm.duty_u16(abs(speed) * 65535 // 100)

    def forward(self, speed=100):
        self.drive(abs(speed))

    def reverse(self, speed=100):
        self.drive(-abs(speed))

    def brake(self):
        """Short brake: IN1 = IN2 = H (outputs both low, motor stops quickly)."""
        self.wake()
        self.in1.value(1)
        self.in2.value(1)
        self.pwm.duty_u16(65535)

    def stop(self):
        """Stop: IN1 = IN2 = L with PWM high, outputs high impedance, motor coasts."""
        self.in1.value(0)
        self.in2.value(0)
        self.pwm.duty_u16(65535)
