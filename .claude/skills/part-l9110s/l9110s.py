# L9110S dual-channel motor driver module (two ASIC L9110 chips), MicroPython driver for ONE channel.
# Make one L9110S object per motor: motor A = A-IA, A-IB; motor B = B-IA, B-IB.
# Logic table from the L9110 datasheet (IA, IB -> OA, OB):
#   H, L -> H, L   forward
#   L, H -> L, H   reverse
#   L, L -> L, L   both outputs low (motor stopped, braked)
#   H, H -> L, L   both outputs low (motor stopped, braked)
# The board has no enable pin: speed is set by PWM on the input that is high.
# Inputs are TTL/CMOS: high >= 2.5 V, low <= 0.7 V, so 3.3 V GPIOs drive them directly.
from machine import Pin, PWM


class L9110S:
    def __init__(self, ia, ib, freq=1000):
        """ia, ib: GPIO numbers wired to the channel's IA and IB pins (A-IA/A-IB or B-IA/B-IB)."""
        self.ia = PWM(Pin(ia, Pin.OUT), freq=freq, duty_u16=0)
        self.ib = PWM(Pin(ib, Pin.OUT), freq=freq, duty_u16=0)

    @staticmethod
    def _duty(speed):
        speed = max(0, min(100, speed))
        return speed * 65535 // 100

    def forward(self, speed=100):
        """IA driven (PWM duty = speed %), IB low -> OA high, OB low."""
        self.ib.duty_u16(0)
        self.ia.duty_u16(self._duty(speed))

    def reverse(self, speed=100):
        """IA low, IB driven (PWM duty = speed %) -> OA low, OB high."""
        self.ia.duty_u16(0)
        self.ib.duty_u16(self._duty(speed))

    def stop(self):
        """Both inputs low -> both outputs low: the motor stops."""
        self.ia.duty_u16(0)
        self.ib.duty_u16(0)

    def deinit(self):
        self.stop()
        self.ia.deinit()
        self.ib.deinit()
