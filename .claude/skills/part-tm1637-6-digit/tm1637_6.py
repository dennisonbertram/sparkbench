# TM1637 6-digit 7-segment LED display module (Titan Micro TM1637), MicroPython driver.
# Two-wire bus from the datasheet (not I2C, no address): start = DIO falls while CLK is high,
# stop = DIO rises while CLK is high, DIO only changes while CLK is low, bytes go LSB first,
# and the chip pulls DIO low for the 9th (ACK) clock of every byte.
# Writes use auto-increment mode: data command 0x40, address command 0xC0 + 6 bytes (C0H-C5H),
# then display control 0x88 | brightness (0-7 = 1/16 ... 14/16 pulse width).
#
# On the common 6-digit module (diymore "6-Digit LED Display TM1637") the two 3-digit LED blocks
# are wired so the display RAM is not in left-to-right order: digit 1 (leftmost) is driven by
# C2H, then C1H, C0H, C5H, C4H, C3H. DIGIT_MAP converts screen positions to RAM addresses.
from machine import Pin
import time

_DATA_CMD = 0x40   # write display registers, auto-increment address, normal mode
_ADDR_CMD = 0xC0   # display register C0H (GRID1)
_DISP_CTRL = 0x80  # display control; 0x08 = display on, low 3 bits = brightness
_DELAY_US = 5      # half clock period: ~100 kHz, under the datasheet's 250 kHz limit

DIGITS = 6
DIGIT_MAP = (2, 1, 0, 5, 4, 3)  # RAM address (offset from C0H) for each digit, left to right

# Segment bits: bit0 = a, bit1 = b ... bit6 = g, bit7 = DP (every digit has a dot on this module).
_NUMS = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)
_CHARS = {
    ' ': 0x00, '-': 0x40, '_': 0x08, '*': 0x63,  # '*' = degree sign
    'A': 0x77, 'B': 0x7C, 'C': 0x39, 'D': 0x5E, 'E': 0x79, 'F': 0x71, 'G': 0x3D, 'H': 0x76,
    'I': 0x30, 'J': 0x1E, 'L': 0x38, 'N': 0x54, 'O': 0x5C, 'P': 0x73, 'Q': 0x67, 'R': 0x50,
    'S': 0x6D, 'T': 0x78, 'U': 0x3E, 'Y': 0x6E,
}


def encode(ch):
    """Segment byte for one character (digits, a few letters, space, '-', '_', '*' = degree)."""
    if '0' <= ch <= '9':
        return _NUMS[ord(ch) - 48]
    return _CHARS.get(ch.upper(), 0x00)


class TM1637:
    def __init__(self, clk, dio, brightness=7):
        # Push-pull outputs, idle high. DIO is driven low during each ACK clock (the chip also
        # pulls it low then), so the pin never fights the chip.
        self.clk = Pin(clk, Pin.OUT, value=1)
        self.dio = Pin(dio, Pin.OUT, value=1)
        if not 0 <= brightness <= 7:
            raise ValueError('brightness 0-7')
        self._bright = brightness
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

    def _control(self):
        self._command(_DISP_CTRL | (0x08 if self._on else 0) | self._bright)

    # --- display ---
    def write_raw(self, ram):
        """Write 6 bytes straight into display RAM C0H-C5H (RAM order, not screen order)."""
        if len(ram) != DIGITS:
            raise ValueError('need 6 bytes')
        self._command(_DATA_CMD)
        self._start()
        self._write_byte(_ADDR_CMD)
        for s in ram:
            self._write_byte(s & 0xFF)
        self._stop()
        self._control()

    def write(self, segments):
        """Write up to 6 segment bytes in screen order (index 0 = leftmost digit)."""
        segs = list(segments)[:DIGITS]
        segs += [0] * (DIGITS - len(segs))
        ram = [0] * DIGITS
        for pos in range(DIGITS):
            ram[DIGIT_MAP[pos]] = segs[pos]
        self.write_raw(ram)

    def brightness(self, value=None):
        """Get or set brightness 0-7 (1/16 to 14/16 pulse width)."""
        if value is None:
            return self._bright
        if not 0 <= value <= 7:
            raise ValueError('brightness 0-7')
        self._bright = value
        self._control()

    def power(self, on):
        self._on = bool(on)
        self._control()

    def clear(self):
        self.write([0] * DIGITS)

    def show(self, text):
        """Show text left aligned; a '.' lights the decimal point of the character before it."""
        segs = []
        for ch in text:
            if ch == '.' and segs and not segs[-1] & 0x80:
                segs[-1] |= 0x80
            else:
                segs.append(encode(ch) | (0x80 if ch == '.' else 0))
        if len(segs) > DIGITS:
            raise ValueError('text too long for 6 digits')
        self.write(segs)

    def number(self, n):
        """Show an integer right aligned (-99999 to 999999)."""
        n = int(n)
        if not -99999 <= n <= 999999:
            raise ValueError('number out of range')
        self.show('%6d' % n)

    def decimal(self, value, places=1):
        """Show a float right aligned with `places` digits after the decimal point."""
        s = ('%.' + str(int(places)) + 'f') % value
        if len(s.replace('.', '')) > DIGITS:
            raise ValueError('number out of range')
        pad = DIGITS - len(s.replace('.', ''))
        self.show(' ' * pad + s)
