# DRV8838 single brushed DC motor driver (TI DRV8838), MicroPython driver.
# PHASE/ENABLE interface from the TI datasheet (SLVSBA4F, Table 7-2 "DRV8838 Device Logic"):
#   nSLEEP = 0              -> OUT1/OUT2 Hi-Z: coast (sleep mode)
#   nSLEEP = 1, EN = 0      -> OUT1 L, OUT2 L: brake
#   nSLEEP = 1, PH = 0, EN = 1 -> OUT1 H, OUT2 L: forward
#   nSLEEP = 1, PH = 1, EN = 1 -> OUT1 L, OUT2 H: reverse
# Speed: PWM on EN (0-250 kHz allowed); while EN is low the outputs brake (both low).
# Inputs: VIH <= 0.5 x VCC, VIL >= 0.25 x VCC, max 5.5 V, so 3.3 V GPIOs work with VCC = 3.3 V or 5 V.
# PH and EN have ~100 kOhm pull-downs on the chip. On the Pololu carrier SLP has a 10 kOhm pull-up to VCC,
# so the driver is awake unless SLP is driven low. Wake time after nSLEEP rises: tWAKE <= 30 us.
from machine import Pin, PWM
import time


class DRV8838:
    def __init__(self, ph, en, slp=None, freq=20000):
        """ph, en: GPIO numbers wired to PH and EN.
        slp: GPIO number wired to SLP (nSLEEP), or None to leave it on the board's pull-up (always awake).
        freq: PWM frequency on EN for speed control (20 kHz is above hearing; datasheet max 250 kHz)."""
        self._en_no = en
        self._freq = freq
        self._pwm = None
        self.ph = Pin(ph, Pin.OUT, value=0)
        self.en = Pin(en, Pin.OUT, value=0)
        self.slp = None
        if slp is not None:
            self.slp = Pin(slp, Pin.OUT, value=0)
            self.wake()

    def wake(self):
        """Drive nSLEEP high and wait tWAKE (30 us max)."""
        if self.slp is not None:
            self.slp.value(1)
            time.sleep_us(30)

    def sleep(self):
        """nSLEEP low: outputs Hi-Z (the motor coasts), chip draws nanoamps.
        On the Pololu carrier the 10 kOhm pull-up then draws VCC / 10 kOhm."""
        if self.slp is not None:
            self.slp.value(0)

    def _enable(self, speed):
        speed = max(0, min(100, speed))
        if speed > 0 and self.slp is not None and not self.slp.value():
            self.wake()  # coming back from coast()
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
            self.en = Pin(self._en_no, Pin.OUT)
        if speed >= 100:
            self.en.value(1)
        elif speed <= 0:
            self.en.value(0)
        else:
            # EN high = drive, EN low = brake, so the duty cycle is the speed.
            self._pwm = PWM(Pin(self._en_no), freq=self._freq, duty_u16=speed * 65535 // 100)

    def forward(self, speed=100):
        """PH low, EN high (or PWM): OUT1 high, OUT2 low. speed 0-100 %."""
        self.ph.value(0)
        self._enable(speed)

    def reverse(self, speed=100):
        """PH high, EN high (or PWM): OUT1 low, OUT2 high. speed 0-100 %."""
        self.ph.value(1)
        self._enable(speed)

    def brake(self):
        """EN low: both outputs low, the motor is shorted and stops quickly."""
        self._enable(0)

    def coast(self):
        """Outputs Hi-Z so the motor spins down freely. Needs SLP wired to a GPIO."""
        self._enable(0)
        self.sleep()

    def stop(self):
        self.brake()
