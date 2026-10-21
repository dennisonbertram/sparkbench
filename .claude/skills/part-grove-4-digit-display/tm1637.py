# TM1637 4-digit 7-segment LED display (Titan Micro TM1637, e.g. Seeed Grove - 4-Digit Display), MicroPython driver.
# Two-wire bus from the datasheet (not I2C, no address): start = DIO falls while CLK is high,
# stop = DIO rises while CLK is high, DIO only changes while CLK is low, bytes go LSB first,
# and the chip pulls DIO low for the 9th (ACK) clock of every byte.
# Writes use auto-increment mode: data command 0x40, address command 0xC0 + digits,
# then display control 0x88 | brightness (0-7 = 1/16 ... 14/16 pulse width).
from machine import Pin
import time

_DATA_CMD = 0x40   # write display registers, auto-increment address, normal mode
_ADDR_CMD = 0xC0   # display register C0H = leftmost digit (GRID1)
_DISP_CTRL = 0x80  # display control; 0x08 = display on, low 3 bits = brightness
_DELAY_US = 5      # half clock period: ~100 kHz, well under the 250-500 kHz limit

# Segment bits: bit0 = a, bit1 = b ... bit6 = g, bit7 = DP (the colon on digit 2 of clock modules).
_DIGITS = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)
_CHARS = {
    ' ': 0x00, '-': 0x40, '_': 0x08, '*': 0x63,  # '*' = degree sign
    'A': 0x77, 'B': 0x7C, 'C': 0x39, 'D': 0x5E, 'E': 0x79, 'F': 0x71, 'G': 0x3D, 'H': 0x76,
    'I': 0x30, 'J': 0x1E, 'L': 0x38, 'N': 0x54, 'O': 0x5C, 'P': 0x73, 'Q': 0x67, 'R': 0x50,
    'T': 0x78, 'U': 0x3E, 'Y': 0x6E,
}


def encode(ch):
    """Segment byte for one character (digits, a few letters, space, '-', '_', '*' = degree)."""
    if '0' <= ch <= '9':
        return _DIGITS[ord(ch) - 48]
    return _CHARS.get(ch.upper(), 0x00)


class TM1637:
    def __init__(self, clk, dio, brightness=7, digits=4):
        # Push-pull outputs, idle high. DIO is driven low during each ACK clock (the chip also
        # pulls it low then), so the pins never fight the chip and never see the module's VCC.
        self.clk = Pin(clk, Pin.OUT, value=1)
        self.dio = Pin(dio, Pin.OUT, value=1)
        self.digits = digits
        self._bright = brightness & 0x07
        self._on = True
        time.sleep_us(_DELAY_US)
        self.clear()

    # --- bus primitives (datasheet "Interface interpretation") ---
    def _start(self):
        # bus idle: CLK high, DIO high
        self.dio(0)
        time.sleep_us(_DELAY_US)
        self.clk(0)
        time.sleep_us(_DELAY_US)

    def _stop(self):
        self.dio(0)
        time.sleep_us(_DELAY_US)
        self.clk(1)
        time.sleep_us(_DELAY_US)
        self.dio(1)
        time.sleep_us(_DELAY_US)

    def _write_byte(self, b):
        for i in range(8):  # LSB first, DIO changes only while CLK is low
            self.dio((b >> i) & 1)
            time.sleep_us(_DELAY_US)
            self.clk(1)
            time.sleep_us(_DELAY_US)
            self.clk(0)
        # 9th clock: the TM1637 holds DIO low as its ACK; drive low too so nothing contends
        self.dio(0)
        time.sleep_us(_DELAY_US)
        self.clk(1)
        time.sleep_us(_DELAY_US)
        self.clk(0)
        time.sleep_us(_DELAY_US)

    def _command(self, c):
        self._start()
        self._write_byte(c)
        self._stop()

    # --- display ---
    def write(self, segments, pos=0):
        """Write raw segment bytes starting at digit pos (0 = leftmost)."""
        if not 0 <= pos < 6:
            raise ValueError('position 0-5')
        self._command(_DATA_CMD)
        self._start()
        self._write_byte(_ADDR_CMD | pos)
        for s in segments:
            self._write_byte(s & 0xFF)
        self._stop()
        self._command(_DISP_CTRL | (0x08 if self._on else 0) | self._bright)

    def brightness(self, value=None):
        """Get or set brightness 0-7 (1/16 to 14/16 pulse width)."""
        if value is None:
            return self._bright
        if not 0 <= value <= 7:
            raise ValueError('brightness 0-7')
        self._bright = value
        self._command(_DISP_CTRL | (0x08 if self._on else 0) | self._bright)

    def power(self, on):
        self._on = bool(on)
        self._command(_DISP_CTRL | (0x08 if self._on else 0) | self._bright)

    def clear(self):
        self.write([0] * self.digits)

    def show(self, text, colon=False):
        """Show up to `digits` characters, left aligned. colon=True lights the clock colon."""
        text = (text + ' ' * self.digits)[:self.digits]
        segs = [encode(c) for c in text]
        if colon and self.digits > 1:
            segs[1] |= 0x80
        self.write(segs)

    def number(self, n):
        """Show an integer right aligned (-999 to 9999)."""
        n = int(n)
        if not -999 <= n <= 9999:
            raise ValueError('number out of range')
        self.show('%4d' % n)

    def numbers(self, left, right, colon=True):
        """Show two 2-digit numbers, e.g. hours and minutes as 12:34."""
        if not (0 <= left <= 99 and 0 <= right <= 99):
            raise ValueError('numbers 0-99')
        self.show('%02d%02d' % (left, right), colon)
