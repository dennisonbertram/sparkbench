# Winsen ZE08-CH2O electrochemical formaldehyde module, MicroPython driver.
# From the Winsen ZE08-CH2O user's manual V1.0: UART 9600 8N1, 3 V logic.
# Default mode is active upload: once a second the module sends a 9-byte frame
#   FF 17 04 00 CH CL RH RL SUM
#   0x17 = gas CH2O, 0x04 = unit ppb, 0x00 = no decimals,
#   concentration = CH*256 + CL (ppb), full range = RH*256 + RL (5000 ppb).
# SUM = (NOT (byte1 + ... + byte7)) + 1, 8 bits.
# Q&A mode (optional): send FF 01 86 00 00 00 00 00 79, reply
#   FF 86 UGH UGL 00 00 PPBH PPBL SUM (ug/m3 and ppb).
import time

CMD_QA_MODE = b'\xff\x01\x78\x41\x00\x00\x00\x00\x46'
CMD_ACTIVE_MODE = b'\xff\x01\x78\x40\x00\x00\x00\x00\x47'
CMD_READ = b'\xff\x01\x86\x00\x00\x00\x00\x00\x79'


def checksum(frame):
    return (~sum(frame[1:8]) + 1) & 0xFF


class ZE08:
    def __init__(self, uart):
        self.uart = uart
        self.full_range = None

    def _frame(self, head, timeout_ms):
        """Wait for a valid 9-byte frame whose bytes 0-1 are FF, head."""
        t0 = time.ticks_ms()
        buf = b''
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n)
                while len(buf) >= 9:
                    if buf[0] == 0xFF and buf[1] == head and checksum(buf) == buf[8]:
                        f = buf[:9]
                        return f
                    buf = buf[1:]
            else:
                time.sleep_ms(10)
        raise OSError('ZE08-CH2O: no valid frame (check TXD wiring, 9600 baud)')

    def read_ppb(self, timeout_ms=2500):
        """Active-upload mode (default): next concentration in ppb."""
        f = self._frame(0x17, timeout_ms)
        dec = f[3]
        self.full_range = (f[6] << 8) | f[7]
        v = (f[4] << 8) | f[5]
        return v / (10 ** dec) if dec else v

    def read_ppm(self, timeout_ms=2500):
        return self.read_ppb(timeout_ms) / 1000

    def set_qa_mode(self):
        self.uart.write(CMD_QA_MODE)

    def set_active_mode(self):
        self.uart.write(CMD_ACTIVE_MODE)

    def query(self, timeout_ms=1000):
        """Q&A mode only: returns (ug/m3, ppb)."""
        while self.uart.any():
            self.uart.read()
        self.uart.write(CMD_READ)
        f = self._frame(0x86, timeout_ms)
        return (f[2] << 8) | f[3], (f[6] << 8) | f[7]
