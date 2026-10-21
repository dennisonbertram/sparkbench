# AT42QT1070 in standalone mode (Adafruit #1362 "Standalone 5-Pad Capacitive Touch Sensor
# Breakout"), MicroPython driver.
# In standalone mode (MODE tied to VDD, as on this board) the chip has no I2C: each key drives
# an open-drain output OUTn LOW while the key is in detect and releases it otherwise.
# The chip already debounces (detect integrator), calibrates and drift-compensates, so the
# host only reads the pins. Key 0 is the fixed guard channel: it has priority and its touch
# overrides the other keys. Only one key is reported at a time.
# The outputs need a pull-up: the board only has an LED + 470 ohm to VDD on each output, which
# does not give a valid logic high. Use 10 kOhm resistors to the MCU's 3.3 V (or the internal
# pull-up, which ESP32 GPIO34-39 do not have).
from machine import Pin


class QT1070:
    def __init__(self, outs, pull_up=True):
        """outs: GPIO numbers wired to OUT0..OUT4 (use None for an output that is not wired)."""
        self.pins = [None if g is None else self._input(g, pull_up) for g in outs]

    @staticmethod
    def _input(gpio, pull_up):
        if pull_up:
            try:
                return Pin(gpio, Pin.IN, Pin.PULL_UP)
            except (ValueError, OSError):
                pass  # input-only pin without internal pull-up: rely on the external resistor
        return Pin(gpio, Pin.IN)

    def is_touched(self, key):
        p = self.pins[key]
        return p is not None and p.value() == 0  # open-drain output pulled LOW = key in detect

    def touched(self):
        """List of key numbers currently in detect (normally zero or one entry)."""
        return [k for k in range(len(self.pins)) if self.is_touched(k)]

    def key(self):
        """The key in detect (0 = guard key), or None when nothing is touched."""
        t = self.touched()
        return t[0] if t else None
