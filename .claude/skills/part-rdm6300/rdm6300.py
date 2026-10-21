# RDM6300 125 kHz EM4100 RFID reader, MicroPython driver.
# The module sends a 14-byte frame at 9600 baud 8N1 while a tag is in the field (RDM630/RDM6300 spec):
#   0x02 | 10 ASCII hex chars (1 version/customer byte + 4-byte card number) | 2 ASCII hex checksum | 0x03
# Checksum = XOR of the 5 data bytes spelled by the 10 hex characters.
# Datasheet example: tag 62E3086CED -> 62^E3^08^6C^ED = 0x08.
import time


class RDM6300:
    FRAME_LEN = 14

    def __init__(self, uart):
        # uart: machine.UART already set to baudrate=9600, bits=8, parity=None, stop=1
        self.uart = uart
        self._buf = b''

    def _frame(self):
        n = self.uart.any()
        if n:
            data = self.uart.read(n)
            if data:
                self._buf = (self._buf + data)[-64:]
        while True:
            i = self._buf.find(b'\x02')
            if i < 0:
                self._buf = b''
                return None
            if len(self._buf) - i < self.FRAME_LEN:
                self._buf = self._buf[i:]
                return None
            f = self._buf[i:i + self.FRAME_LEN]
            if f[13] == 0x03:
                self._buf = self._buf[i + self.FRAME_LEN:]
                return f
            self._buf = self._buf[i + 1:]  # false start byte, resync

    def read(self):
        """Return (tag_hex, card_number) for the next valid frame, or None.

        tag_hex is the 10-character ID (e.g. '62E3086CED'); card_number is the 4-byte card
        number (last 8 hex chars) as an int, the decimal number often printed on cards."""
        while True:
            f = self._frame()
            if f is None:
                return None
            try:
                tag = f[1:11].decode()
                data = bytes.fromhex(tag) if hasattr(bytes, 'fromhex') else bytes(int(tag[k:k + 2], 16) for k in range(0, 10, 2))
                chk = int(f[11:13].decode(), 16)
            except (ValueError, UnicodeError):
                continue
            x = 0
            for b in data:
                x ^= b
            if x == chk:
                return tag, int(tag[2:], 16)

    def wait(self, timeout_ms=None):
        """Block until a tag is read (or timeout_ms passes, then return None)."""
        t0 = time.ticks_ms()
        while True:
            r = self.read()
            if r:
                return r
            if timeout_ms is not None and time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return None
            time.sleep_ms(20)
