# MCP4728 quad 12-bit I2C DAC with EEPROM (Microchip DS22187E), MicroPython driver.
# Writes use the Multi-Write command (0 1 0 0 0 DAC1 DAC0 UDAC) with UDAC = 0, so each
# channel's output updates at the last byte's ACK whatever the LDAC pin is doing.
# VOUT = VDD * code / 4096 (VREF = VDD, gain ignored) or 2.048 V * gain * code / 4096 (internal VREF).
import time

VREF_VDD = 0
VREF_INTERNAL = 1
INTERNAL_VREF = 2.048

# Power-down modes (PD1 PD0): output pulled to GND through 1 k, 100 k or 500 k.
PD_NORMAL = 0
PD_1K = 1
PD_100K = 2
PD_500K = 3


class MCP4728:
    def __init__(self, i2c, addr=0x60, vdd=3.3):
        self.i2c = i2c
        self.addr = addr
        self.vdd = vdd  # supply voltage on VCC: the full-scale value when VREF = VDD

    def write(self, ch, code, vref=VREF_VDD, gain=1, pd=PD_NORMAL):
        """Set channel ch (0-3 = A-D) to a 12-bit code; EEPROM is not touched."""
        if not 0 <= ch <= 3:
            raise ValueError('channel must be 0-3 (A-D)')
        code = max(0, min(4095, int(code)))
        cmd = 0x40 | (ch << 1)  # Multi-Write, UDAC = 0
        hi = ((vref & 1) << 7) | ((pd & 3) << 5) | ((1 if gain == 2 else 0) << 4) | (code >> 8)
        self.i2c.writeto(self.addr, bytes([cmd, hi, code & 0xFF]))

    def set_voltage(self, ch, volts, vref=VREF_VDD, gain=1):
        """Set channel ch to the nearest code for volts (clamped to the reachable range)."""
        full = self.vdd if vref == VREF_VDD else INTERNAL_VREF * (2 if gain == 2 else 1)
        code = max(0, min(4095, round(volts * 4096 / full)))  # with internal VREF the output still stops at VDD
        self.write(ch, code, vref, gain)
        return code

    def fast_write(self, codes, pds=(0, 0, 0, 0)):
        """Fast Write: 12-bit codes for A, B, C, D (keeps each channel's VREF and gain)."""
        buf = bytearray()
        for c, pd in zip(codes, pds):
            c = max(0, min(4095, int(c)))
            buf.append(((pd & 3) << 4) | (c >> 8))
            buf.append(c & 0xFF)
        self.i2c.writeto(self.addr, buf)

    def select_vref(self, a, b, c, d):
        """Write the VREF bits of all channels (1 = internal 2.048 V, 0 = VDD)."""
        self.i2c.writeto(self.addr, bytes([0x80 | (a << 3) | (b << 2) | (c << 1) | d]))

    def select_gain(self, a, b, c, d):
        """Write the gain bits of all channels (1 = x2, 0 = x1; only used with internal VREF)."""
        self.i2c.writeto(self.addr, bytes([0xC0 | (a << 3) | (b << 2) | (c << 1) | d]))

    def power_down(self, a=PD_NORMAL, b=PD_NORMAL, c=PD_NORMAL, d=PD_NORMAL):
        """Write the power-down bits of all channels (PD_NORMAL wakes a channel up)."""
        self.i2c.writeto(self.addr, bytes([0xA0 | (a << 2) | b, (c << 6) | (d << 4)]))

    def save(self, ch, code, vref=VREF_VDD, gain=1, pd=PD_NORMAL):
        """Single Write: set channel ch AND its EEPROM (restored at power-up). Waits for RDY/BSY."""
        code = max(0, min(4095, int(code)))
        hi = ((vref & 1) << 7) | ((pd & 3) << 5) | ((1 if gain == 2 else 0) << 4) | (code >> 8)
        self.i2c.writeto(self.addr, bytes([0x58 | (ch << 1), hi, code & 0xFF]))
        for _ in range(50):  # EEPROM write takes up to 50 ms; the chip ignores commands until done
            time.sleep_ms(5)
            if self.i2c.readfrom(self.addr, 1)[0] & 0x80:
                return
        raise OSError('MCP4728 EEPROM write timed out')

    def read(self):
        """Read the 24-byte status block. Returns [(input, eeprom)] for A-D, each a dict."""
        d = self.i2c.readfrom(self.addr, 24)
        out = []
        for ch in range(4):
            regs = []
            for k in (0, 3):
                s, hi, lo = d[ch * 6 + k], d[ch * 6 + k + 1], d[ch * 6 + k + 2]
                regs.append({
                    'ready': bool(s & 0x80), 'por': bool(s & 0x40), 'addr_bits': s & 7,
                    'vref': hi >> 7, 'pd': (hi >> 5) & 3, 'gain': 2 if hi & 0x10 else 1,
                    'code': ((hi & 0x0F) << 8) | lo,
                })
            out.append(tuple(regs))
        return out
