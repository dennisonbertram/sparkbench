# Cubic CM1106 single-beam NDIR CO2 sensor, MicroPython driver (UART, 9600 8N1).
# Frames (Cubic UART protocol): host sends 0x11 LEN CMD DATA... CS, module answers 0x16 LEN CMD DATA... CS.
# CS = 256 - (HEAD + LEN + CMD + DATA) % 256, i.e. all bytes before it, header included.
import time


def _cs(frame):
    return (-sum(frame)) & 0xFF


class CM1106:
    def __init__(self, uart, timeout_ms=300):
        """uart: machine.UART at 9600 baud, 8N1; MCU TX -> sensor RX, MCU RX <- sensor TX (3.3 V TTL)."""
        self.uart = uart
        self.timeout_ms = timeout_ms
        self.status = 0

    def _cmd(self, cmd, data=b'', reply_len=0):
        f = bytearray([0x11, len(data) + 1, cmd]) + bytearray(data)
        f.append(_cs(f))
        while self.uart.any():  # drop stale bytes
            self.uart.read()
        self.uart.write(f)
        if not reply_len:
            return None
        buf = b''
        t0 = time.ticks_ms()
        while len(buf) < reply_len and time.ticks_diff(time.ticks_ms(), t0) < self.timeout_ms:
            d = self.uart.read(reply_len - len(buf))
            if d:
                buf += d
            else:
                time.sleep_ms(5)
        if len(buf) < reply_len:
            raise OSError('CM1106: no reply (check TX/RX are crossed and +5V is powered)')
        if buf[0] != 0x16 or buf[2] != cmd or buf[1] != reply_len - 3:
            raise OSError('CM1106: bad frame')
        if _cs(buf[:-1]) != buf[-1]:
            raise OSError('CM1106: checksum mismatch')
        return buf

    def read_co2(self):
        """Command 0x01: return CO2 in ppm (DF1*256 + DF2). Status byte DF3 is kept in self.status."""
        r = self._cmd(0x01, reply_len=8)  # 16 05 01 DF1 DF2 DF3 DF4 CS
        self.status = r[5]
        return r[3] * 256 + r[4]

    def preheating(self):
        return bool(self.status & 0x01)

    def error(self):
        return bool(self.status & 0x02)

    def calibrate(self, ppm=400):
        """Command 0x03: set the current reading to `ppm` (400-1500). Hold that CO2 level stable for 2 min first."""
        if not 400 <= ppm <= 1500:
            raise ValueError('target must be 400-1500 ppm')
        self._cmd(0x03, bytes([ppm >> 8, ppm & 0xFF]), reply_len=4)  # 16 01 03 E6

    def set_abc(self, on, days=7, base=400):
        """Command 0x10: auto baseline correction on/off, cycle 1-30 days, base value (default 400 ppm)."""
        data = bytes([0x64, 0 if on else 2, days, base >> 8, base & 0xFF, 0x64])
        self._cmd(0x10, data, reply_len=4)  # 16 01 10 D9
