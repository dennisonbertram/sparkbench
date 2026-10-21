# MB85RC256V 256 Kbit (32 KB) I2C FRAM (Fujitsu MB85RC256V), MicroPython driver.
# Memory map 0x0000-0x7FFF, two address bytes (high first, top bit 0) after the device address 0b1010 A2 A1 A0.
# FRAM writes complete as the ACK is sent: no write-cycle delay and no page boundaries (the address wraps at 0x7FFF).

SIZE = 0x8000


class MB85RC256V:
    def __init__(self, i2c, addr=0x50):
        self.i2c = i2c
        self.addr = addr

    @staticmethod
    def _a(mem):
        mem &= 0x7FFF  # 15-bit address: the top bit of the high byte must be 0
        return bytes([mem >> 8, mem & 0xFF])

    def write(self, mem, data):
        """Write bytes starting at memory address mem (byte write / page write)."""
        self.i2c.writeto(self.addr, self._a(mem) + bytes(data))

    def read(self, mem, n):
        """Random/sequential read: set the address, repeated START, read n bytes."""
        self.i2c.writeto(self.addr, self._a(mem), False)
        return self.i2c.readfrom(self.addr, n)

    def write_byte(self, mem, value):
        self.write(mem, bytes([value & 0xFF]))

    def read_byte(self, mem):
        return self.read(mem, 1)[0]

    def write_u16(self, mem, value):
        """Store a 16-bit value, high byte first."""
        self.write(mem, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def read_u16(self, mem):
        d = self.read(mem, 2)
        return (d[0] << 8) | d[1]

    def device_id(self):
        """Read the 3-byte Device ID through the reserved slave ID 0xF8/0xF9 (7-bit 0x7C).
        Returns (manufacturer, product); a genuine MB85RC256V gives (0x00A, 0x510)."""
        self.i2c.writeto(0x7C, bytes([self.addr << 1]), False)
        d = self.i2c.readfrom(0x7C, 3)
        return (d[0] << 4) | (d[1] >> 4), ((d[1] & 0x0F) << 8) | d[2]
