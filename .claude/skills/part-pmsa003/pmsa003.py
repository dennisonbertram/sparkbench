# Plantower PMSA003 laser particulate sensor, MicroPython driver.
# Frame format from the Plantower PMSA003 data manual (Appendix I / II):
# 9600 baud 8N1; 32-byte frame 0x42 0x4D, frame length (2x13+2 = 28), 13 big-endian 16-bit data words,
# then a 16-bit check code = sum of all previous 30 bytes.
# Power the sensor from 5 V (the fan needs it); TX/RX/SET/RESET are 3.3 V logic.
import time

_CMD_READ = 0xE2     # read in passive mode
_CMD_MODE = 0xE1     # DATAL 0x00 = passive, 0x01 = active
_CMD_SLEEP = 0xE4    # DATAL 0x00 = sleep, 0x01 = wake up


class PMSA003:
    def __init__(self, uart):
        """uart: machine.UART at 9600 baud (8N1), its RX wired to the sensor's TX."""
        self.uart = uart

    def _command(self, cmd, datah=0, datal=0):
        frame = bytearray([0x42, 0x4D, cmd, datah, datal])
        s = sum(frame)
        frame.append((s >> 8) & 0xFF)
        frame.append(s & 0xFF)
        self.uart.write(frame)

    def set_passive(self):
        """Stop the automatic frames; then call read_passive() to ask for one."""
        self._command(_CMD_MODE, 0, 0x00)

    def set_active(self):
        """Default after power-up: the sensor sends a frame every 0.2-2.3 s by itself."""
        self._command(_CMD_MODE, 0, 0x01)

    def sleep(self):
        self._command(_CMD_SLEEP, 0, 0x00)

    def wake(self):
        """After waking, wait at least 30 s before trusting the readings (fan spin-up)."""
        self._command(_CMD_SLEEP, 0, 0x01)

    def _read_byte(self, deadline):
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            if self.uart.any():
                b = self.uart.read(1)
                if b:
                    return b[0]
            else:
                time.sleep_ms(5)
        return None

    def read(self, timeout_ms=3000):
        """Wait for the next valid frame and return a dict of readings, or None on timeout.
        Keys: pm1_0_cf1, pm2_5_cf1, pm10_cf1 (ug/m3, CF=1 'factory' values),
        pm1_0, pm2_5, pm10 (ug/m3, atmospheric environment: use these indoors/outdoors),
        n0_3, n0_5, n1_0, n2_5, n5_0, n10 (particles larger than that many um per 0.1 L of air)."""
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while True:
            b = self._read_byte(deadline)
            if b is None:
                return None
            if b != 0x42:
                continue
            b = self._read_byte(deadline)
            if b is None:
                return None
            if b != 0x4D:
                continue
            rest = bytearray()
            while len(rest) < 30:
                b = self._read_byte(deadline)
                if b is None:
                    return None
                rest.append(b)
            length = (rest[0] << 8) | rest[1]
            if length != 28:
                continue
            check = (rest[28] << 8) | rest[29]
            if (0x42 + 0x4D + sum(rest[0:28])) & 0xFFFF != check:
                continue  # corrupted frame: wait for the next one
            w = [(rest[2 + 2 * i] << 8) | rest[3 + 2 * i] for i in range(13)]
            return {
                'pm1_0_cf1': w[0], 'pm2_5_cf1': w[1], 'pm10_cf1': w[2],
                'pm1_0': w[3], 'pm2_5': w[4], 'pm10': w[5],
                'n0_3': w[6], 'n0_5': w[7], 'n1_0': w[8],
                'n2_5': w[9], 'n5_0': w[10], 'n10': w[11],
            }

    def read_passive(self, timeout_ms=1000):
        """In passive mode: request one frame and return it (see read())."""
        while self.uart.any():
            self.uart.read()
        self._command(_CMD_READ)
        return self.read(timeout_ms)
