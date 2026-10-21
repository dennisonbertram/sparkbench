# ULN2803A 8-channel Darlington sink driver (TI ULN2803AN, DIP-18), MicroPython driver.
# Each channel is an NPN Darlington pair with a 2.7 kOhm series base resistor on chip:
# input nB high = output nC pulls down to GND (sinks up to 500 mA, 50 V max), input low or open = output off.
# TI SLRS049C: VI(on) <= 2.4 V for 200 mA and <= 2.7 V for 250 mA (VCE = 2 V), so a 3.3 V GPIO drives it.
# A 3.3 V GPIO high draws about 0.2-0.3 mA per input (II(on) is 0.93 mA typ. at 3.85 V).
# Loads go between the load supply (+) and an nC output; COM (pin 10) goes to that same supply so the
# built-in clamp diodes catch the flyback from relays, solenoids and motors.
# There is no logic, no timing and no protocol: the GPIO level is the switch state. Switching takes
# under 1 us (tPHL 20 ns, tPLH 130 ns typ.).
from machine import Pin


class ULN2803:
    def __init__(self, pins):
        """pins: GPIO numbers wired to inputs 1B..8B, in that order (fewer than 8 is fine)."""
        self.pins = [Pin(p, Pin.OUT, value=0) for p in pins]

    def on(self, ch):
        """Channel ch (1-8): output sinks current, the load is powered."""
        self.pins[ch - 1].value(1)

    def off(self, ch):
        """Channel ch (1-8): output off (open), the load is unpowered."""
        self.pins[ch - 1].value(0)

    def set(self, ch, state):
        self.pins[ch - 1].value(1 if state else 0)

    def is_on(self, ch):
        return bool(self.pins[ch - 1].value())

    def write(self, mask):
        """Set every channel from a bit mask: bit 0 = channel 1 ... bit 7 = channel 8."""
        for i, p in enumerate(self.pins):
            p.value((mask >> i) & 1)

    def value(self):
        """The current bit mask (bit 0 = channel 1)."""
        m = 0
        for i, p in enumerate(self.pins):
            if p.value():
                m |= 1 << i
        return m

    def all_off(self):
        self.write(0)
