# 74HC595 8-bit serial-in / parallel-out shift register (TI SN74HC595), MicroPython driver.
# Per the datasheet function table: SER is sampled on each SRCLK rising edge (first stage takes SER,
# every other stage takes the previous one), and an RCLK rising edge copies the shift register to the
# output (storage) register. Bits are sent MSB first, so after 8 clocks bit 7 sits in QH and bit 0 in QA.
# Several chips can be chained (QH' of one to SER of the next); the last chip's byte is sent first.
from machine import Pin


class SR595:
    def __init__(self, ser, srclk, rclk, chain=1, srclr=None, oe=None):
        """ser/srclk/rclk/srclr/oe are GPIO numbers. srclr and oe are optional: leave them None when
        SRCLR is tied to VCC and OE is tied to GND on the breadboard."""
        self.ser = Pin(ser, Pin.OUT, value=0)
        self.srclk = Pin(srclk, Pin.OUT, value=0)
        self.rclk = Pin(rclk, Pin.OUT, value=0)
        self.chain = chain
        self.srclr = Pin(srclr, Pin.OUT, value=1) if srclr is not None else None
        self.oe = Pin(oe, Pin.OUT, value=0) if oe is not None else None
        self._state = bytearray(chain)

    def _shift_byte(self, b):
        for i in range(7, -1, -1):
            self.ser.value((b >> i) & 1)
            self.srclk.value(1)  # SER is clocked in on the rising edge
            self.srclk.value(0)

    def latch(self):
        """Copy the shift register to the outputs QA-QH (RCLK rising edge)."""
        self.rclk.value(1)
        self.rclk.value(0)

    def write(self, value):
        """Set all outputs at once. With chain=1 value is 0-255 (bit 0 = QA ... bit 7 = QH);
        with chained chips, bits 8-15 go to the second chip, and so on."""
        for n in range(self.chain - 1, -1, -1):
            b = (value >> (8 * n)) & 0xFF
            self._state[n] = b
            self._shift_byte(b)
        self.latch()

    def value(self):
        v = 0
        for n in range(self.chain):
            v |= self._state[n] << (8 * n)
        return v

    def pin(self, index, on):
        """Switch one output (0 = QA of the first chip) on or off, leaving the others as they are."""
        v = self.value()
        v = v | (1 << index) if on else v & ~(1 << index)
        self.write(v)

    def clear(self):
        """All outputs off. Uses SRCLR (active low) if it is wired, then latches."""
        if self.srclr is not None:
            self.srclr.value(0)
            self.srclr.value(1)
            for n in range(self.chain):
                self._state[n] = 0
            self.latch()
        else:
            self.write(0)

    def enable(self, on=True):
        """Drive OE (active low) if it is wired: outputs on, or high-impedance (all LEDs dark)."""
        if self.oe is not None:
            self.oe.value(0 if on else 1)
