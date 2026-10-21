# 4x4 matrix membrane keypad (Adafruit #3844 and the common 8-pin clones), MicroPython driver.
# Passive switch matrix: pressing a key joins its row line to its column line.
# Scan: columns are inputs with pull-ups; one row at a time is driven LOW while the other
# rows float (input, high impedance), so two keys pressed in one column can never short a
# HIGH output against a LOW one. A LOW column then means the key at (row, column) is down.
from machine import Pin
import time

KEYS_4X4 = ('123A', '456B', '789C', '*0#D')


class Keypad:
    def __init__(self, row_pins, col_pins, keys=KEYS_4X4, debounce_ms=20):
        self._rows = [Pin(p, Pin.IN) for p in row_pins]
        self._cols = [Pin(p, Pin.IN, Pin.PULL_UP) for p in col_pins]
        self._keys = keys
        self._debounce = debounce_ms
        self._last = None

    def scan(self):
        """Return a list of every key held down right now."""
        down = []
        for r, row in enumerate(self._rows):
            row.init(Pin.OUT, value=0)
            time.sleep_us(10)  # let the line settle through the membrane's resistance
            for c, col in enumerate(self._cols):
                if col.value() == 0:
                    down.append(self._keys[r][c])
            row.init(Pin.IN)
        return down

    def key(self):
        """Return the key held now (first one found), or None."""
        k = self.scan()
        return k[0] if k else None

    def get_key(self):
        """Return a key once, when it is newly pressed (debounced); otherwise None."""
        k = self.key()
        if k is not None and k != self._last:
            time.sleep_ms(self._debounce)
            if self.key() != k:
                return None  # contact bounce: try again on the next call
            self._last = k
            return k
        self._last = k
        return None
