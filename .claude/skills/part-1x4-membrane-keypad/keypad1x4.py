# 1x4 membrane keypad (Adafruit #1332 and its clones), MicroPython driver.
# The keypad is just 4 switches with one shared (common) wire: every key joins the common line R1
# to its own line C1-C4. Ribbon order (pin 1 first) is R1, C2, C1, C4, C3 -- not 1-2-3-4.
# Reading: the common line is held low (a GPIO driven to 0, or tied to GND) and the four key lines
# are inputs with pull-ups; a key line that reads 0 means that key is held.
import time

KEYS_1X4 = ('1', '2', '3', '4')


class Keypad1x4:
    def __init__(self, com_pin, key_pins, keys=KEYS_1X4, debounce_ms=20):
        """com_pin: GPIO wired to R1 (or None if R1 is wired straight to GND).
        key_pins: GPIOs wired to C1, C2, C3, C4 (keys 1, 2, 3, 4), in that order."""
        from machine import Pin
        self.com = Pin(com_pin, Pin.OUT, value=0) if com_pin is not None else None
        self.cols = [Pin(p, Pin.IN, Pin.PULL_UP) for p in key_pins]
        self.keys = keys
        self.debounce_ms = debounce_ms
        self._last = None

    def pressed(self):
        """Return a list of the labels of every key held right now (each key has its own line,
        so any combination is read correctly)."""
        return [self.keys[i] for i, c in enumerate(self.cols) if c.value() == 0]

    def scan(self):
        """Return the label of the first key held right now, or None."""
        p = self.pressed()
        return p[0] if p else None

    def get_key(self):
        """Return a key's label once, when it is newly pressed (debounced); otherwise None."""
        k = self.scan()
        if k is not None and k != self._last:
            time.sleep_ms(self.debounce_ms)
            if self.scan() != k:
                return None  # contact bounce or released: ignore
            self._last = k
            return k
        self._last = k
        return None
