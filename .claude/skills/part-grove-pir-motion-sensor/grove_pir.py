# Seeed Grove - PIR Motion Sensor v1.2 (SKU 101020020), MicroPython driver.
# The board carries a BISS0001-type PIR controller (TM2291 on the v1.2 schematic) and an
# LHI778 pyroelectric element, powered from an on-board XC6206P332 3.3 V LDO fed by Grove VCC.
# The controller's VO output (push-pull from its 3.3 V rail, active high) reaches the Grove
# SIG pin (yellow wire) through a 10 kOhm series resistor (R1):
#   HIGH (about 3.3 V) for Tx after motion (about 2.5-4 s with the fitted R14 = 10k, C1 = 10 nF)
#   LOW  (0 V) otherwise; after Tx it ignores new triggers for Ti (about 1 s, 4.7 MOhm x 10 nF).
# Jumper J2 selects non-retriggerable (default, A tied to GND) or retriggerable (A to VDD).
# Safe for 3.3 V GPIOs even when VCC is 5 V. No pull-up/down needed.
# Allow up to a minute after power-up for the detector to settle.
from machine import Pin


class GrovePIR:
    def __init__(self, sig_pin):
        self.pin = Pin(sig_pin, Pin.IN) if isinstance(sig_pin, int) else sig_pin

    def motion(self):
        """True while the sensor reports motion (SIG high)."""
        return self.pin.value() == 1

    def on_change(self, handler):
        """Call handler(motion: bool) on every edge of SIG. Pass None to stop."""
        if handler is None:
            self.pin.irq(handler=None)
            return
        self.pin.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
                     handler=lambda p: handler(p.value() == 1))
