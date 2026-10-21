# AT24C256 256-Kbit (32,768 x 8) I2C serial EEPROM, MicroPython driver.
# Written from the Microchip/Atmel AT24C256C datasheet (Atmel-8568F):
# - device address 1010 A2 A1 A0 (0x50-0x57; 0x50 with A2..A0 at GND)
# - two word-address bytes (high byte first; bit 15 is don't-care, 15 bits used)
# - 64-byte pages: during a write the low 6 address bits wrap inside the page,
#   so writes are split at page boundaries here
# - self-timed write cycle tWR = 5 ms max; the chip NACKs its address until done
#   (acknowledge polling)
# - random read = dummy write of the address, repeated start, then sequential read
import time

SIZE = 32768
PAGE = 64
T_WR_MS = 5


class AT24C256:
    def __init__(self, i2c, addr=0x50):
        self.i2c = i2c
        self.addr = addr

    def _check(self, mem, n):
        if mem < 0 or n < 0 or mem + n > SIZE:
            raise ValueError("address out of range")

    def _wait_ready(self, timeout_ms=20):
        # Acknowledge polling: the EEPROM only ACKs its address once the
        # internal write cycle has finished.
        time.sleep_ms(T_WR_MS)
        t0 = time.ticks_ms()
        while True:
            try:
                self.i2c.writeto(self.addr, b"")
                return
            except OSError:
                if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                    raise OSError("AT24C256 busy (no ACK after write)")
                time.sleep_ms(1)

    def read(self, mem, n):
        """Read n bytes starting at address mem (sequential read)."""
        self._check(mem, n)
        self.i2c.writeto(self.addr, bytes([(mem >> 8) & 0x7F, mem & 0xFF]), False)
        return self.i2c.readfrom(self.addr, n)

    def write(self, mem, data):
        """Write bytes at address mem, split into page writes of at most 64 bytes."""
        data = bytes(data)
        self._check(mem, len(data))
        i = 0
        while i < len(data):
            room = PAGE - (mem % PAGE)  # bytes left in this page
            chunk = data[i:i + room]
            self.i2c.writeto(self.addr, bytes([(mem >> 8) & 0x7F, mem & 0xFF]) + chunk)
            self._wait_ready()
            mem += len(chunk)
            i += len(chunk)

    def read_byte(self, mem):
        return self.read(mem, 1)[0]

    def write_byte(self, mem, value):
        self.write(mem, bytes([value & 0xFF]))
