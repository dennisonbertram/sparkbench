# Seeed Grove - IR Distance Interrupter v1.2 (Everlight ITR9909 reflective pair + LM393 comparator), MicroPython driver.
# Board circuit (Seeed Eagle schematic):
#   IR LED always on (anode to VCC, cathode through 3 x 220 ohm in parallel to GND).
#   Phototransistor collector to VCC, emitter through 2.7 MOhm to GND -> LM393 -IN.
#   10 k trimmer (wiper, 1 nF to GND) -> LM393 +IN sets the threshold.
#   LM393 open-collector output = SIG, 2.7 kOhm pull-up to VCC; the red LED (4.7 k from VCC) lights when SIG is LOW.
# So: IR reflected back (object / light surface in front) -> emitter voltage rises above the threshold
#     -> SIG = LOW, LED on.  Nothing in front (or a dark surface) -> SIG = HIGH (pulled up to VCC).
# SIG swings to VCC: on a 3.3 V board power the module from 3.3 V.
from machine import Pin


class GroveIRInterrupter:
    def __init__(self, sig_pin):
        # SIG already has a 2.7 kOhm pull-up on the module.
        self.sig = Pin(sig_pin, Pin.IN) if isinstance(sig_pin, int) else sig_pin

    def raw(self):
        """Logic level on SIG: 0 = reflection detected, 1 = nothing detected."""
        return self.sig.value()

    def detected(self):
        """True while reflected IR exceeds the trimmer threshold (object / light surface in front)."""
        return self.sig.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when an object appears (falling edge) or, with on_detect=False,
        when it goes away (rising edge)."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.sig.irq(handler=handler, trigger=trig)
