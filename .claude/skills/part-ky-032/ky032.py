# KY-032 IR obstacle avoidance module (Keyes / Joy-IT SEN-KY032IR), MicroPython driver.
# An NE555 pulses the IR LED at about 38 kHz; an HS0038-type 38 kHz IR receiver drives OUT
# directly. OUT is active LOW: 0 while an obstacle reflects the IR back, 1 when the path is clear.
# EN (active high per the Joy-IT manual) only matters with the EN jumper removed; with the
# jumper fitted the emitter runs all the time and EN is left unconnected.
from machine import Pin


class KY032:
    def __init__(self, out_pin, en_pin=None):
        # The receiver output already idles high at the module supply; the internal
        # pull-up just keeps OUT defined if the module is unpowered.
        self.out = Pin(out_pin, Pin.IN, Pin.PULL_UP) if isinstance(out_pin, int) else out_pin
        self.en = None
        if en_pin is not None:
            self.en = Pin(en_pin, Pin.OUT, value=1) if isinstance(en_pin, int) else en_pin

    def value(self):
        """Raw level on OUT: 0 = obstacle, 1 = clear."""
        return self.out.value()

    def obstacle(self):
        """True while an obstacle is detected (OUT low)."""
        return self.out.value() == 0

    def enable(self, on=True):
        """Switch the IR emitter on/off via EN (EN jumper must be removed)."""
        if self.en is None:
            raise ValueError('no EN pin given')
        self.en.value(1 if on else 0)
