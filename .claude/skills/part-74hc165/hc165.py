# MicroPython driver for the 74HC165 8-bit parallel-in / serial-out shift register
# (TI SN74HC165, datasheet SCLS116H).
#
# How the chip works (datasheet section 8):
#   - SH/LD low copies the eight parallel inputs A..H into the register at once
#     (CLK, CLK INH and SER are ignored while SH/LD is low).
#   - With SH/LD high and CLK INH low, every rising edge of CLK shifts the register
#     one place toward QH; SER feeds the empty end (H is on QH first, A last).
#   - QH (pin 9) shows the bit at the end of the register; /QH (pin 7) is its inverse.
# Daisy-chain: QH of chip 2 -> SER of chip 1, so after 8 clocks chip 2's bits follow.
# All datasheet timings are tens of ns; MicroPython pin toggles take microseconds,
# so no extra delays are needed.

from machine import Pin


class HC165:
    def __init__(self, load, clock, data, clk_inh=None, chips=1):
        """load = SH/LD pin, clock = CLK pin, data = QH pin (all machine.Pin or GPIO numbers).
        clk_inh: optional CLK INH pin; if None it must be tied to GND on the board.
        chips: how many 74HC165s are daisy-chained (QH of the far chip into SER of the near one)."""
        self.ld = load if isinstance(load, Pin) else Pin(load, Pin.OUT, value=1)
        self.clk = clock if isinstance(clock, Pin) else Pin(clock, Pin.OUT, value=0)
        self.q = data if isinstance(data, Pin) else Pin(data, Pin.IN)
        self.ld.init(Pin.OUT, value=1)
        self.clk.init(Pin.OUT, value=0)
        self.inh = None
        if clk_inh is not None:
            self.inh = clk_inh if isinstance(clk_inh, Pin) else Pin(clk_inh, Pin.OUT, value=0)
            self.inh.init(Pin.OUT, value=0)
        self.chips = chips

    def read(self):
        """Latch the inputs and shift them in. Returns an int with chips*8 bits:
        for one chip bit 7 = H ... bit 0 = A (1 = that input is high)."""
        self.clk.value(0)
        # Parallel load: SH/LD low, then back high to enter shift mode.
        self.ld.value(0)
        self.ld.value(1)
        if self.inh is not None:
            self.inh.value(0)
        value = 0
        for _ in range(8 * self.chips):
            value = (value << 1) | self.q.value()  # QH already shows the next bit
            self.clk.value(1)  # rising edge shifts the next bit onto QH
            self.clk.value(0)
        return value

    def pin(self, n):
        """Level of input n (0 = A ... 7 = H on the first chip; 8.. = next chip)."""
        v = self.read()
        # Bits of the chip nearest the MCU come out first, so they are the high byte.
        chip = n // 8
        shift = 8 * (self.chips - 1 - chip) + (n % 8)
        return (v >> shift) & 1
