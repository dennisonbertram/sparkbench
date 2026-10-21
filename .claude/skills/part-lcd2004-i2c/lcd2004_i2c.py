# LCD2004 (HD44780-compatible 20x4 character LCD) on a PCF8574 I2C backpack.
# Backpack wiring: P0 = RS, P1 = RW, P2 = E, P3 = backlight, P4-P7 = D4-D7 (4-bit mode).
# Init sequence and timings from the Hitachi HD44780U datasheet (Figure 24, 4-bit interface).
import time

_RS = 0x01
_RW = 0x02
_EN = 0x04
_BL = 0x08


class LCD2004:
    def __init__(self, i2c, addr=0x27, cols=20, rows=4):
        self.i2c = i2c
        self.addr = addr
        self.cols = cols
        self.rows = rows
        self.bl = _BL
        self.i2c.writeto(self.addr, bytes([0]))  # all port lines low, E low
        time.sleep_ms(50)  # > 40 ms after VCC rises to 2.7 V
        self._nib(0x03, 0)
        time.sleep_ms(5)  # > 4.1 ms
        self._nib(0x03, 0)
        time.sleep_ms(1)  # > 100 us
        self._nib(0x03, 0)
        time.sleep_ms(1)
        self._nib(0x02, 0)  # switch to 4-bit
        time.sleep_ms(1)
        self.cmd(0x28)  # function set: 4-bit, 2 lines (4-row panels use N=1), 5x8 dots
        self.cmd(0x08)  # display off
        self.clear()
        self.cmd(0x06)  # entry mode: increment, no shift
        self.cmd(0x0C)  # display on, cursor off, blink off

    def _w(self, b):
        self.i2c.writeto(self.addr, bytes([b | self.bl]))

    def _nib(self, n, rs):
        b = ((n & 0x0F) << 4) | rs
        self._w(b | _EN)  # E high (each I2C byte takes ~90 us at 100 kHz, > 450 ns PWEH)
        self._w(b)  # E falling edge latches the nibble

    def _byte(self, v, rs):
        self._nib(v >> 4, rs)
        self._nib(v & 0x0F, rs)

    def cmd(self, c):
        self._byte(c, 0)
        if c <= 0x03:
            time.sleep_ms(2)  # clear / return home take 1.52 ms
        else:
            time.sleep_us(50)  # other instructions take 37 us

    def clear(self):
        self.cmd(0x01)

    def home(self):
        self.cmd(0x02)

    def move_to(self, col, row):
        # DDRAM start of each line on a 20x4 panel: 0x00, 0x40, 0x14, 0x54
        base = (0x00, 0x40, self.cols, 0x40 + self.cols)[row]
        self.cmd(0x80 | (base + col))

    def putchar(self, ch):
        self._byte(ord(ch), _RS)
        time.sleep_us(50)

    def putstr(self, s):
        for ch in s:
            self.putchar(ch)

    def backlight(self, on=True):
        self.bl = _BL if on else 0
        self._w(0)

    def display(self, on=True):
        self.cmd(0x0C if on else 0x08)
