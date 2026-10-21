# Seeed Grove - Hall Sensor (SKU 101020046), MicroPython driver.
# Chip: Allegro A1101 continuous-time unipolar Hall-effect switch (datasheet A1101-DS).
#   B > BOP (south pole facing the branded face; A1101: 50-160 G at 25 C) -> NMOS output ON  -> SIG LOW
#   B < BRP (field removed; A1101: 10-130 G at 25 C)                       -> output OFF      -> SIG HIGH
# Hysteresis about 55 G, so the output does not chatter. The north pole does not switch it.
# Board circuit (Seeed Twig Hall Sensor v0.9b): A1101 VOUT -> Grove SIG, pulled up to VCC through
# R1 (1 kOhm) in series with the red LED D1, so the LED lights while a magnet is detected.
# Because of that on-board pull-up, read SIG as a plain input (Seeed's demo uses INPUT, no pull).
# Output switching is fast (rise/fall < 400 ns), so it can count RPM with interrupts.
from machine import Pin


class GroveHallSensor:
    def __init__(self, pin):
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin

    def value(self):
        """Raw level on SIG: 0 = magnet detected (output transistor on), 1 = no magnet."""
        return self.pin.value()

    def detected(self):
        """True while a strong enough south pole is at the sensor (the output is active low)."""
        return self.pin.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when a magnet arrives (falling edge) or, with on_detect=False, leaves."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING)
