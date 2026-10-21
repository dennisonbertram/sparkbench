# TM1638 LED&KEY module (Titan Micro TM1638: 8 digits, 8 LEDs, 8 keys), MicroPython driver.
# Serial interface from the datasheet (not SPI hardware, not I2C): STB low frames a transfer and the
# first byte after STB falls is a command; bytes go LSB first; the chip latches DIO on CLK rising
# (CLK idles high, DIO changes only while CLK is low). PWCLK >= 400 ns, STB high >= 1 us,
# CLK rise -> STB rise >= 1 us, and after the 0x42 read-keys command wait >= 1 us (tWAIT)
# before the first CLK fall; the chip then shifts key data out on DIO (open drain, the module's
# 10k pull-up gives the high level), one bit per clock, BYTE1..BYTE4, LSB first.
# Display RAM (16 bytes): even addresses 00H, 02H ... 0EH = digit 1..8 segments (bit0 = a ... bit6 = g,
# bit7 = dp); odd addresses 01H ... 0FH = LED1..LED8 on SEG9 (bit 0).
# Keys on LED&KEY: all on K3; S1..S4 on KS1, KS3, KS5, KS7 and S5..S8 on KS2, KS4, KS6, KS8, so
# S1..S4 are bit 0 of BYTE1..4 and S5..S8 are bit 4 of BYTE1..4.
from machine import Pin
import time

_DATA_WRITE = 0x40   # data command: write display RAM, auto-increment address, normal mode
_DATA_FIXED = 0x44   # data command: write, fixed address
_DATA_READ = 0x42    # data command: read key-scan data
_ADDR = 0xC0         # address command | 00H-0FH
_DISP = 0x80         # display control | 0x08 on | brightness 0-7 (1/16 ... 14/16 pulse width)

_DIGITS = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)
_CHARS = {
    ' ': 0x00, '-': 0x40, '_': 0x08, '*': 0x63,  # '*' = degree sign
    'A': 0x77, 'B': 0x7C, 'C': 0x39, 'D': 0x5E, 'E': 0x79, 'F': 0x71, 'G': 0x3D, 'H': 0x76,
    'I': 0x30, 'J': 0x1E, 'L': 0x38, 'N': 0x54, 'O': 0x5C, 'P': 0x73, 'Q': 0x67, 'R': 0x50,
    'S': 0x6D, 'T': 0x78, 'U': 0x3E, 'Y': 0x6E,
}


def encode(ch):
    """Segment byte for one character (digits, some letters, space, '-', '_', '*' = degree)."""
    if '0' <= ch <= '9':
        return _DIGITS[ord(ch) - 48]
    return _CHARS.get(ch.upper(), 0x00)


class TM1638:
    def __init__(self, stb, clk, dio, brightness=7):
        self.stb = Pin(stb, Pin.OUT, value=1)
        self.clk = Pin(clk, Pin.OUT, value=1)
        self.dio = Pin(dio, Pin.OUT, value=1)
        self._bright = brightness & 0x07
        self._on = True
        time.sleep_ms(1)
        self.clear()
        self._display_ctrl()

    # --- bus primitives ---
    def _byte(self, b):
        for i in range(8):           # LSB first, latched on CLK rising
            self.clk(0)
            self.dio((b >> i) & 1)
            time.sleep_us(1)
            self.clk(1)
            time.sleep_us(1)

    def _begin(self):
        self.stb(0)
        time.sleep_us(1)

    def _end(self):
        time.sleep_us(1)             # tCLK-STB >= 1 us
        self.stb(1)
        time.sleep_us(1)             # PWSTB >= 1 us

    def _command(self, c):
        self._begin()
        self._byte(c)
        self._end()

    def _display_ctrl(self):
        self._command(_DISP | (0x08 if self._on else 0) | self._bright)

    # --- display RAM ---
    def write(self, data, addr=0):
        """Write raw bytes into display RAM starting at addr (0-15, auto-increment)."""
        if not 0 <= addr <= 15 or addr + len(data) > 16:
            raise ValueError('RAM address 0-15')
        self._command(_DATA_WRITE)
        self._begin()
        self._byte(_ADDR | addr)
        for b in data:
            self._byte(b & 0xFF)
        self._end()

    def _put(self, addr, value):
        self._command(_DATA_FIXED)
        self._begin()
        self._byte(_ADDR | addr)
        self._byte(value & 0xFF)
        self._end()

    def clear(self):
        self.write([0] * 16)

    def brightness(self, value=None):
        """Get or set brightness 0-7."""
        if value is None:
            return self._bright
        if not 0 <= value <= 7:
            raise ValueError('brightness 0-7')
        self._bright = value
        self._display_ctrl()

    def power(self, on):
        self._on = bool(on)
        self._display_ctrl()

    def segments(self, segs, pos=0):
        """Raw segment bytes for digits starting at pos (0 = leftmost)."""
        for i, s in enumerate(segs):
            if 0 <= pos + i < 8:
                self._put(2 * (pos + i), s)

    def show(self, text, pos=0):
        """Show text left aligned from digit pos; a '.' lights the previous digit's point."""
        segs = []
        for ch in text:
            if ch == '.' and segs:
                segs[-1] |= 0x80
            else:
                segs.append(encode(ch))
        self.segments(segs[:8 - pos], pos)

    def number(self, n):
        """Show an integer right aligned (-9999999 to 99999999)."""
        n = int(n)
        if not -9999999 <= n <= 99999999:
            raise ValueError('number out of range')
        self.show('%8d' % n)

    def led(self, index, on):
        """Switch LED1..LED8 (index 0-7) on or off."""
        if not 0 <= index <= 7:
            raise ValueError('LED 0-7')
        self._put(2 * index + 1, 1 if on else 0)

    def leds(self, mask):
        """Set all 8 LEDs from a bitmask (bit 0 = LED1)."""
        for i in range(8):
            self._put(2 * i + 1, (mask >> i) & 1)

    # --- keys ---
    def read_key_bytes(self):
        """The four raw key-scan bytes BYTE1..BYTE4."""
        self._begin()
        self._byte(_DATA_READ)
        self.dio.init(Pin.IN, Pin.PULL_UP)   # release DIO: the chip drives it open drain
        time.sleep_us(2)                     # tWAIT >= 1 us before the first CLK fall
        out = []
        for _ in range(4):
            b = 0
            for i in range(8):
                self.clk(0)
                time.sleep_us(1)
                self.clk(1)
                time.sleep_us(1)
                if self.dio.value():
                    b |= 1 << i
            out.append(b)
        self._end()
        self.dio.init(Pin.OUT, value=1)
        return out

    def keys(self):
        """Bitmask of pressed keys, bit 0 = S1 ... bit 7 = S8."""
        k = 0
        for i, b in enumerate(self.read_key_bytes()):
            if b & 0x01:          # K3/KS(2i+1)
                k |= 1 << i
            if b & 0x10:          # K3/KS(2i+2)
                k |= 1 << (i + 4)
        return k
