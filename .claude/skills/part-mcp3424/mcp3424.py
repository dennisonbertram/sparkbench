# MCP3424 18-bit 4-channel delta-sigma ADC (Microchip MCP3422/3/4, DS22088C), MicroPython driver.
# One-shot conversions: write the configuration byte with RDY=1, wait, then read the data bytes
# followed by the configuration byte until its RDY bit reads 0 (Section 5.3.4).
import time

# Resolution bits -> (S1S0 bits, conversion time in ms at that rate, data bytes)
_RATES = {
    12: (0b00, 5, 2),    # 240 SPS
    14: (0b01, 17, 2),   # 60 SPS
    16: (0b10, 67, 2),   # 15 SPS
    18: (0b11, 267, 3),  # 3.75 SPS
}
_GAINS = {1: 0b00, 2: 0b01, 4: 0b10, 8: 0b11}


class MCP3424:
    def __init__(self, i2c, addr=0x68, bits=18, gain=1):
        if bits not in _RATES:
            raise ValueError('bits must be 12, 14, 16 or 18')
        if gain not in _GAINS:
            raise ValueError('gain must be 1, 2, 4 or 8')
        self.i2c = i2c
        self.addr = addr
        self.bits = bits
        self.gain = gain

    def _config(self, channel):
        # RDY=1 (start a conversion), C1C0 = channel, O/C=0 (one-shot), S1S0 = rate, G1G0 = PGA gain
        return 0x80 | ((channel & 0x03) << 5) | (_RATES[self.bits][0] << 2) | _GAINS[self.gain]

    def read_raw(self, channel):
        """Convert channel 1-4 once and return the signed output code."""
        if not 1 <= channel <= 4:
            raise ValueError('channel must be 1-4')
        _, conv_ms, nbytes = _RATES[self.bits]
        self.i2c.writeto(self.addr, bytes([self._config(channel - 1)]))
        time.sleep_ms(conv_ms)
        for _ in range(50):
            d = self.i2c.readfrom(self.addr, nbytes + 1)
            if not d[nbytes] & 0x80:  # RDY = 0: the result is new
                break
            time.sleep_ms(conv_ms // 10 + 1)
        else:
            raise OSError('MCP3424 conversion did not finish')
        if nbytes == 3:
            raw = ((d[0] & 0x03) << 16) | (d[1] << 8) | d[2]
        else:
            raw = (d[0] << 8) | d[1]
            raw &= (1 << self.bits) - 1
        if raw & (1 << (self.bits - 1)):
            raw -= 1 << self.bits
        return raw

    def lsb(self):
        """Volts per code at the input pins: 2 x 2.048 V / 2^N, divided by the PGA gain."""
        return 4.096 / (1 << self.bits) / self.gain

    def read_volts(self, channel):
        """Differential voltage CHn+ minus CHn- in volts."""
        return self.read_raw(channel) * self.lsb()
