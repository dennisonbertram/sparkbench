# 3x4 matrix membrane keypad (Adafruit #419 and its clones), MicroPython driver.
# The keypad is just 12 switches: each key joins one row wire (R1-R4) to one column wire (C1-C3).
# Scan: columns are inputs with pull-ups; one row at a time is driven low and any column that
# reads low has its key pressed. Rows that are not being scanned are left as inputs (high-impedance)
# so that two keys held in the same column can never short a high output to a low one.
import time

KEYS_3X4 = ('123', '456', '789', '*0#')


class Keypad:
    def __init__(self, row_pins, col_pins, keys=KEYS_3X4, debounce_ms=20):
        from machine import Pin
        self._Pin = Pin
        self.rows = [Pin(p, Pin.IN) for p in row_pins]
        self.cols = [Pin(p, Pin.IN, Pin.PULL_UP) for p in col_pins]
        self.keys = keys
        self.debounce_ms = debounce_ms
        self._last = None

    def scan(self):
        """Return the label of the key held right now, or None."""
        Pin = self._Pin
        found = None
        for r, row in enumerate(self.rows):
            row.init(Pin.OUT, value=0)
            time.sleep_us(10)  # let the membrane trace and pull-ups settle
            for c, col in enumerate(self.cols):
                if col.value() == 0 and found is None:
                    found = self.keys[r][c]
            row.init(Pin.IN)
        return found

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
