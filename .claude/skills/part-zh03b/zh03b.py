# Winsen ZH03B laser dust (particulate) module, MicroPython driver.
# From the Winsen ZH03B manual V2.1: UART 9600 8N1, 3.3 V logic, 5 V supply.
# Default mode is initiative (active) upload: once a second a 24-byte frame
#   42 4D 00 14  D1 D2 D3  PM1.0 PM2.5 PM10  D7 D8 D9  CS
# every Dn / PM field is 16 bits big-endian, PM values in ug/m3 (0-1000),
# D1-D3 and D7-D9 reserved; CS = 16-bit sum of bytes 1..22 (big-endian).
# Q&A mode: send FF 01 86 00 00 00 00 00 79, reply
#   FF 86 PM2.5(2) PM10(2) PM1.0(2) SUM, SUM = (NOT(byte1+...+byte7)) + 1.
import time

CMD_QA_MODE = b'\xff\x01\x78\x41\x00\x00\x00\x00\x46'
CMD_ACTIVE_MODE = b'\xff\x01\x78\x40\x00\x00\x00\x00\x47'
CMD_READ = b'\xff\x01\x86\x00\x00\x00\x00\x00\x79'
CMD_SLEEP = b'\xff\x01\xa7\x01\x00\x00\x00\x00\x57'
CMD_WAKE = b'\xff\x01\xa7\x00\x00\x00\x00\x00\x58'


def _qa_checksum(frame):
    return (~sum(frame[1:8]) + 1) & 0xFF


class ZH03B:
    def __init__(self, uart):
        self.uart = uart
        self._buf = b''

    def _drain(self):
        while self.uart.any():
            self.uart.read()
        self._buf = b''

    def read(self, timeout_ms=2500):
        """Initiative-upload mode (default): next frame as a dict of ug/m3 values."""
        t0 = time.ticks_ms()
        buf = self._buf
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n)
            while len(buf) >= 24:
                if buf[0] == 0x42 and buf[1] == 0x4D and buf[2] == 0x00 and buf[3] == 0x14:
                    f = buf[:24]
                    if (sum(f[:22]) & 0xFFFF) == ((f[22] << 8) | f[23]):
                        self._buf = buf[24:]
                        return {
                            'pm1_0': (f[10] << 8) | f[11],
                            'pm2_5': (f[12] << 8) | f[13],
                            'pm10': (f[14] << 8) | f[15],
                        }
                buf = buf[1:]
            if not n:
                time.sleep_ms(10)
        self._buf = buf[-23:]
        raise OSError('ZH03B: no valid frame (check TXD wiring, 5 V supply, 9600 baud)')

    def set_qa_mode(self):
        self.uart.write(CMD_QA_MODE)
        time.sleep_ms(100)
        self._drain()

    def set_active_mode(self):
        self.uart.write(CMD_ACTIVE_MODE)

    def query(self, timeout_ms=1000):
        """Q&A mode only: returns dict of ug/m3 values."""
        self._drain()
        self.uart.write(CMD_READ)
        f = self._reply(0x86, timeout_ms)
        return {
            'pm2_5': (f[2] << 8) | f[3],
            'pm10': (f[4] << 8) | f[5],
            'pm1_0': (f[6] << 8) | f[7],
        }

    def sleep(self, timeout_ms=1000):
        """Dormant mode (fan and laser off). Returns True on success."""
        self._drain()
        self.uart.write(CMD_SLEEP)
        return self._reply(0xA7, timeout_ms)[2] == 0x01

    def wake(self, timeout_ms=1000):
        self._drain()
        self.uart.write(CMD_WAKE)
        return self._reply(0xA7, timeout_ms)[2] == 0x01

    def _reply(self, cmd, timeout_ms):
        t0 = time.ticks_ms()
        buf = b''
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n)
                while len(buf) >= 9:
                    if buf[0] == 0xFF and buf[1] == cmd and _qa_checksum(buf) == buf[8]:
                        return buf[:9]
                    buf = buf[1:]
            else:
                time.sleep_ms(10)
        raise OSError('ZH03B: no reply to command 0x%02X' % cmd)
