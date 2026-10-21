# Winsen ZE07-CO electrochemical carbon monoxide module, MicroPython driver.
# From the Winsen ZE07-CO user's manual V1.7: UART 9600 8N1, 3 V TTL levels.
# Default mode is initiative (active) upload: once a second the module sends
#   FF 04 03 01 CH CL RH RL SUM
#   0x04 = gas CO, 0x03 = unit ppm, 0x01 = one decimal place,
#   concentration = (CH*256 + CL) x 0.1 ppm, full range = RH*256 + RL
#   (0x1388 = 5000 -> 500.0 ppm).
# SUM = (NOT (byte1 + ... + byte7)) + 1, 8 bits
#   (manual example FF 04 03 01 00 25 13 88 38 -> 3.7 ppm).
# Q&A mode (optional): send FF 01 86 00 00 00 00 00 79, reply
#   FF 86 CH CL 00 00 CH CL SUM, concentration = (CH*256 + CL) x 0.1 ppm.
import time

CMD_QA_MODE = b'\xff\x01\x78\x41\x00\x00\x00\x00\x46'
CMD_ACTIVE_MODE = b'\xff\x01\x78\x40\x00\x00\x00\x00\x47'
CMD_READ = b'\xff\x01\x86\x00\x00\x00\x00\x00\x79'


def checksum(frame):
    return (~sum(frame[1:8]) + 1) & 0xFF


class ZE07:
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
                        return buf[:9]
                    buf = buf[1:]
            else:
                time.sleep_ms(10)
        raise OSError('ZE07-CO: no valid frame (check TXD wiring, 9600 baud)')

    def read_raw(self, timeout_ms=2500):
        """Active-upload mode (default): next concentration in 0.1 ppm counts."""
        f = self._frame(0x04, timeout_ms)
        self.decimals = f[3]
        self.full_range = (f[6] << 8) | f[7]
        return (f[4] << 8) | f[5]

    def read_ppm(self, timeout_ms=2500):
        """Active-upload mode (default): next CO concentration in ppm."""
        raw = self.read_raw(timeout_ms)
        return raw / (10 ** self.decimals)

    def set_qa_mode(self):
        self.uart.write(CMD_QA_MODE)

    def set_active_mode(self):
        self.uart.write(CMD_ACTIVE_MODE)

    def query_ppm(self, timeout_ms=1000):
        """Q&A mode only: ask for one reading, returns ppm."""
        while self.uart.any():
            self.uart.read()
        self.uart.write(CMD_READ)
        f = self._frame(0x86, timeout_ms)
        return ((f[2] << 8) | f[3]) * 0.1
