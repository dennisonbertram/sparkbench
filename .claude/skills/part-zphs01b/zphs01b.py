# Winsen ZPHS01B multi-in-one air quality module, MicroPython driver.
# From the Winsen ZPHS01B manual V1.3 (2020-07-13): UART 9600 8N1, 3 V TTL levels
# (3.3 V compatible), 5 V supply. Question-and-answer only: the module sends
# nothing until the host asks.
# Read command: FF 01 86 00 00 00 00 00 79
# Reply, 26 bytes (big-endian 16-bit fields):
#   0 FF  1 86  2-3 PM1.0  4-5 PM2.5  6-7 PM10 (ug/m3)  8-9 CO2 (ppm)
#   10 VOC grade 0-3  11-12 temperature ((raw-500) x 0.1 C)  13-14 RH (%)
#   15-16 CH2O (x0.001 mg/m3)  17-18 CO (x0.1 ppm)  19-20 O3 (x0.01 ppm)
#   21-22 NO2 (x0.01 ppm)  23-24 reserved  25 check
# Check = (NOT(byte1 + ... + byte24)) + 1, low 8 bits.
import time

CMD_READ = b'\xff\x01\x86\x00\x00\x00\x00\x00\x79'
FRAME_LEN = 26


def _checksum(frame):
    return (~sum(frame[1:25]) + 1) & 0xFF


def _u16(f, i):
    return (f[i] << 8) | f[i + 1]


class ZPHS01B:
    def __init__(self, uart):
        self.uart = uart

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def read_raw(self, timeout_ms=1000):
        """Send the read command and return the verified 26-byte reply."""
        self._drain()
        self.uart.write(CMD_READ)
        t0 = time.ticks_ms()
        buf = b''
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n)
                while len(buf) >= FRAME_LEN:
                    if buf[0] == 0xFF and buf[1] == 0x86 and _checksum(buf) == buf[25]:
                        return buf[:FRAME_LEN]
                    buf = buf[1:]
            else:
                time.sleep_ms(10)
        raise OSError('ZPHS01B: no valid reply (check TXD/RXD wiring, 5 V supply, 9600 baud)')

    def read(self, timeout_ms=1000):
        """All readings as a dict, in the datasheet units."""
        f = self.read_raw(timeout_ms)
        return {
            'pm1_0': _u16(f, 2),            # ug/m3
            'pm2_5': _u16(f, 4),            # ug/m3
            'pm10': _u16(f, 6),             # ug/m3
            'co2': _u16(f, 8),              # ppm
            'voc': f[10],                   # grade 0-3
            'temperature': (_u16(f, 11) - 500) / 10,  # deg C
            'humidity': _u16(f, 13),        # %RH
            'ch2o': _u16(f, 15) / 1000,     # mg/m3
            'co': _u16(f, 17) / 10,         # ppm
            'o3': _u16(f, 19) / 100,        # ppm
            'no2': _u16(f, 21) / 100,       # ppm
        }
