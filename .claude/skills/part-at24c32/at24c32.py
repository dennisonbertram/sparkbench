# AT24C32 32 Kbit (4096 x 8) I2C serial EEPROM (Atmel/Microchip AT24C32), MicroPython driver.
# Two word-address bytes (A11..A8, then A7..A0) follow the device address 0b1010 A2 A1 A0 (0x50-0x57).
# Writes go in 32-byte pages: a write never crosses a page boundary (the chip would wrap to the start
# of the same page and overwrite it), and after each page the chip is busy for tWR (10 ms max, 20 ms on
# 1.8 V parts) and NACKs its address until the write is done, so we poll for the ACK.
import time

SIZE = 4096
PAGE = 32


class AT24C32:
    def __init__(self, i2c, addr=0x50, size=SIZE, page=PAGE):
        self.i2c = i2c
        self.addr = addr
        self.size = size
        self.page = page

    def _check(self, memaddr, n):
        if memaddr < 0 or n < 0 or memaddr + n > self.size:
            raise ValueError('AT24C32: address range 0x%03X+%d is outside 0..0x%03X' % (memaddr, n, self.size - 1))

    def wait_ready(self, timeout_ms=25):
        """Acknowledge polling: the chip NACKs its address until the internal write cycle ends."""
        t0 = time.ticks_ms()
        while True:
            try:
                self.i2c.writeto(self.addr, b'')
                return
            except OSError:
                if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                    raise OSError('AT24C32 did not answer: check wiring and the A0-A2 address pins')
                time.sleep_ms(1)

    def read(self, memaddr, n):
        """Random/sequential read: set the 12-bit word address, then read n bytes."""
        self._check(memaddr, n)
        self.i2c.writeto(self.addr, bytes([(memaddr >> 8) & 0x0F, memaddr & 0xFF]), False)
        return self.i2c.readfrom(self.addr, n)

    def write(self, memaddr, data):
        """Write bytes, split at 32-byte page boundaries, waiting out each write cycle."""
        data = bytes(data)
        self._check(memaddr, len(data))
        i = 0
        while i < len(data):
            a = memaddr + i
            n = min(len(data) - i, self.page - (a % self.page))
            self.i2c.writeto(self.addr, bytes([(a >> 8) & 0x0F, a & 0xFF]) + data[i:i + n])
            self.wait_ready()
            i += n

    def read_byte(self, memaddr):
        return self.read(memaddr, 1)[0]

    def write_byte(self, memaddr, value):
        self.write(memaddr, bytes([value & 0xFF]))
