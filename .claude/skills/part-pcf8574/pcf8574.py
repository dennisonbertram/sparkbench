# PCF8574 8-bit quasi-bidirectional I/O expander (TI SCPS068), MicroPython driver.
# The chip has no registers: writing one byte sets the output latch of P7..P0 (bit 7 = P7),
# reading one byte returns the levels on P7..P0. At power-on every latch is high.
# A pin latched high is a weak (~100 uA) pull-up, so it doubles as an input; a pin latched low sinks
# up to 25 mA. Write a pin high before reading it as an input. I2C clock: 100 kHz maximum.


class PCF8574:
    def __init__(self, i2c, addr=0x20):
        self.i2c = i2c
        self.addr = addr  # 0x20 + (A2 << 2) + (A1 << 1) + A0
        self._out = 0xFF  # power-on state: all pins high (inputs)
        self.i2c.writeto(self.addr, bytes([self._out]))

    def read_port(self):
        """The level on P7..P0 as one byte (pins latched low always read 0)."""
        return self.i2c.readfrom(self.addr, 1)[0]

    def write_port(self, value):
        """Set all eight latches at once (bit 7 = P7)."""
        self._out = value & 0xFF
        self.i2c.writeto(self.addr, bytes([self._out]))

    def pin(self, n, value=None):
        """pin(n) reads Pn; pin(n, v) sets Pn's latch (1 = high / input, 0 = low, sinks current)."""
        if not 0 <= n <= 7:
            raise ValueError('pin must be 0-7')
        if value is None:
            return (self.read_port() >> n) & 1
        if value:
            self._out |= 1 << n
        else:
            self._out &= ~(1 << n) & 0xFF
        self.i2c.writeto(self.addr, bytes([self._out]))

    def toggle(self, n):
        self.pin(n, 0 if (self._out >> n) & 1 else 1)
