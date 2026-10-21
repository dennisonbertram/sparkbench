# Seeed Grove - Touch Sensor (Tontek TTP223-BA6), MicroPython driver.
# SIG is the chip's Q output: push-pull CMOS, so no pull resistor is needed.
# On the Grove board AHLB and TOG are fixed: direct mode, active high -
# SIG is high only while the pad is touched (or a finger is very close).
# Datasheet timing: about 0.5 s settling after power-on (do not touch the pad then);
# the BA6 package runs in low-power mode, so the first touch takes up to ~220 ms
# to register, later touches about 60 ms. Max on time is infinite (MOTB=1).
from machine import Pin
import time


class GroveTouch:
    def __init__(self, pin, settle=True):
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        if settle:
            # TTP223 needs ~0.5 s after power-on to calibrate its baseline.
            time.sleep_ms(500)

    def value(self):
        """Raw level on SIG (0 or 1)."""
        return self.pin.value()

    def touched(self):
        """True while the pad is touched (SIG high)."""
        return self.pin.value() == 1

    def irq(self, handler, on_touch=True):
        """Call handler(pin) when a touch starts (on_touch) or ends."""
        self.pin.irq(handler=handler,
                     trigger=Pin.IRQ_RISING if on_touch else Pin.IRQ_FALLING)
