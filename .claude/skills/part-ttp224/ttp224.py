# TTP224 4-key capacitive touch module (Tontek TTP224-BSB), MicroPython driver.
# Each OUTn pin is the chip's TPQn output (pad n). With the option jumpers open (module default)
# the datasheet option table gives: direct mode, CMOS (push-pull) active-high outputs,
# multi-key mode, no maximum on-time, low-power mode. No pull resistor is needed.
# Option jumpers: AHLB->VDD = active low, TOG->VDD = toggle, OD->VSS = open drain
# (then use pull=Pin.PULL_UP with active-low, or PULL_DOWN with active-high),
# SM->VSS = single-key mode, MOT0->VSS = 16 s maximum on time, LPMB->VDD = fast mode.
# Timing: ~0.5 s stable time after power-on (do not touch the pads); response up to ~200 ms
# in low-power mode (first touch), ~100 ms in fast mode (TTP224-BSB at 3 V).
from machine import Pin


class TTP224:
    def __init__(self, out1, out2, out3, out4, active_high=True, pull=None):
        self.pins = [p if not isinstance(p, int) else Pin(p, Pin.IN, pull)
                     for p in (out1, out2, out3, out4)]
        self.active_high = active_high  # False if AHLB is jumpered to VDD

    def touched(self, key):
        """True while pad key (1-4) is touched (direct mode) or latched on (toggle mode)."""
        return self.pins[key - 1].value() == (1 if self.active_high else 0)

    def keys(self):
        """Tuple of four 0/1 flags for pads 1..4."""
        return tuple(1 if self.touched(k) else 0 for k in (1, 2, 3, 4))

    def mask(self):
        """Bit mask: bit 0 = pad 1 ... bit 3 = pad 4."""
        m = 0
        for i, v in enumerate(self.keys()):
            m |= v << i
        return m

    def irq(self, key, handler, on_touch=True):
        """Call handler(pin) on the edge where a touch on pad key (1-4) starts (on_touch) or ends."""
        rising = self.active_high == on_touch
        self.pins[key - 1].irq(handler=handler, trigger=Pin.IRQ_RISING if rising else Pin.IRQ_FALLING)
