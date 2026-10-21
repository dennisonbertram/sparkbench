# PCF8575 16-bit quasi-bidirectional I/O expander (TI SCPS121), MicroPython driver.
# The chip has no registers. Every transfer is a pair of bytes: the first byte is port 0
# (P07..P00, Adafruit labels P7..P0), the second is port 1 (P17..P10, Adafruit labels 15..P8).
# Writing a pair sets all 16 output latches; reading a pair returns the 16 pin levels.
# At power-on every latch is high. A pin latched high is a weak (30-300 uA) pull-up, so it
# doubles as an input; a pin latched low sinks up to 25 mA. Write a pin high before reading it.
# I2C clock: up to 400 kHz.


class PCF8575:
    def __init__(self, i2c, addr=0x20):
        self.i2c = i2c
        self.addr = addr  # 0x20 + (A2 << 2) + (A1 << 1) + A0
        self._out = 0xFFFF  # power-on state: all pins high (inputs)
        self._write()

    def _write(self):
        # port 0 (P07..P00) first, then port 1 (P17..P10)
        self.i2c.writeto(self.addr, bytes([self._out & 0xFF, (self._out >> 8) & 0xFF]))

    def read_port(self):
        """Levels on all 16 pins: bit n = pin n (bits 0-7 = P0-P7, bits 8-15 = P8-P15).
        Pins latched low always read 0."""
        b = self.i2c.readfrom(self.addr, 2)
        return b[0] | (b[1] << 8)

    def write_port(self, value):
        """Set all 16 latches at once (bit n = pin n)."""
        self._out = value & 0xFFFF
        self._write()

    def pin(self, n, value=None):
        """pin(n) reads pin n (0-15); pin(n, v) sets its latch (1 = high / input, 0 = low, sinks current)."""
        if not 0 <= n <= 15:
            raise ValueError('pin must be 0-15')
        if value is None:
            return (self.read_port() >> n) & 1
        if value:
            self._out |= 1 << n
        else:
            self._out &= ~(1 << n) & 0xFFFF
        self._write()

    def toggle(self, n):
        self.pin(n, 0 if (self._out >> n) & 1 else 1)
