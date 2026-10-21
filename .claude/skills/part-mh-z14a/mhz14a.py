# Winsen MH-Z14A NDIR CO2 sensor, MicroPython driver (UART, 9600 8N1).
# Frames are 9 bytes: 0xFF, sensor number / command, 6 data bytes, checksum.
# Checksum = (0xFF - (byte1 + ... + byte7)) + 1, as in the Winsen MH-Z14A manual.
import time


def _checksum(frame):
    return (0xFF - (sum(frame[1:8]) & 0xFF) + 1) & 0xFF


class MHZ14A:
    def __init__(self, uart, timeout_ms=200):
        """uart: machine.UART at 9600 baud, 8N1, wired MCU TX -> sensor RXD, MCU RX <- sensor TXD."""
        self.uart = uart
        self.timeout_ms = timeout_ms

    def _send(self, cmd, b3=0, b4=0, b5=0, b6=0, b7=0):
        f = bytearray([0xFF, 0x01, cmd, b3, b4, b5, b6, b7, 0])
        f[8] = _checksum(f)
        self.uart.write(f)

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def read_co2(self):
        """Send command 0x86 and return the CO2 concentration in ppm (HIGH * 256 + LOW)."""
        self._drain()
        self._send(0x86)
        buf = b''
        t0 = time.ticks_ms()
        while len(buf) < 9 and time.ticks_diff(time.ticks_ms(), t0) < self.timeout_ms:
            if self.uart.any():
                buf += self.uart.read(9 - len(buf))
            else:
                time.sleep_ms(5)
        if len(buf) < 9:
            raise OSError('MH-Z14A: no reply (check TX/RX are crossed and Vin is 5 V)')
        if buf[0] != 0xFF or buf[1] != 0x86:
            raise OSError('MH-Z14A: bad frame start')
        if _checksum(buf) != buf[8]:
            raise OSError('MH-Z14A: checksum mismatch')
        return buf[2] * 256 + buf[3]

    def zero_calibrate(self):
        """Command 0x87: set the current reading as 400 ppm. Only after >= 20 min in fresh (400 ppm) air. No reply."""
        self._send(0x87)

    def span_calibrate(self, ppm=2000):
        """Command 0x88: span calibration at a known concentration (zero-calibrate first). No reply."""
        self._send(0x88, ppm // 256, ppm % 256)

    def set_abc(self, on):
        """Command 0x79: automatic baseline correction on (0xA0) or off (0x00). Factory default: on. No reply."""
        self._send(0x79, 0xA0 if on else 0x00)

    def set_range(self, ppm):
        """Command 0x99: detection range 2000, 5000 or 10000 ppm (bytes 4-7, big-endian). No reply."""
        if ppm not in (2000, 5000, 10000):
            raise ValueError('range must be 2000, 5000 or 10000')
        self._send(0x99, 0, (ppm >> 24) & 0xFF, (ppm >> 16) & 0xFF, (ppm >> 8) & 0xFF, ppm & 0xFF)
