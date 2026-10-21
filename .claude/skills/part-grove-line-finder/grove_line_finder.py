# Seeed Grove - Line Finder v1.1 (SKU 101020172), MicroPython driver.
# Board circuit (Seeed schematic v1.1): RS-06WD reflective sensor. Its IR LED is always on (100 ohm
# from VCC). The phototransistor pulls the LMV358 + input low against a 22 kOhm pull-up when IR is
# reflected back; the R6 10 kOhm trimmer sets the - input. The LMV358 output (rail-to-rail push-pull)
# is SIG, and a red LED (10 kOhm from VCC) lights when SIG is low.
#   Black line (little reflection) or nothing in range: SIG HIGH, LED off.
#   White / light surface:                              SIG LOW,  LED on.
# The module runs on 5 V, so SIG swings to 5 V: on a 3.3 V board feed it through a divider
# (e.g. 10 k top / 15 k bottom gives 3.0 V). The divider does not change the logic, only the level.
from machine import Pin


class GroveLineFinder:
    def __init__(self, sig_pin):
        # SIG is actively driven both ways by the op-amp: no pull-up/pull-down needed.
        self.sig = Pin(sig_pin, Pin.IN) if isinstance(sig_pin, int) else sig_pin

    def raw(self):
        """Logic level on SIG: 1 = black line / nothing, 0 = white surface."""
        return self.sig.value()

    def on_line(self):
        """True over a black line (or when nothing is within range)."""
        return self.sig.value() == 1

    def on_white(self):
        """True over a white / reflective surface (red LED on)."""
        return self.sig.value() == 0

    def irq(self, handler, on_line=True):
        """Call handler(pin) when the sensor moves onto a black line (rising edge) or,
        with on_line=False, onto a white surface (falling edge)."""
        trig = Pin.IRQ_RISING if on_line else Pin.IRQ_FALLING
        return self.sig.irq(handler=handler, trigger=trig)
