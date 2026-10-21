# Plantower PMS7003 particulate matter sensor, MicroPython driver.
# Written from the Plantower "PMS7003 series data manual" V2.5 (Appendix I and II):
# 9600 baud, 8 data bits, no parity, 1 stop bit. In active mode (the power-up default) the sensor sends
# 32-byte frames by itself (every ~2.3 s when steady, 200-800 ms when the concentration changes fast):
#   0x42 0x4D, frame length (2 bytes, = 2*13+2 = 28), 13 big-endian 16-bit data words,
#   check code (2 bytes) = sum of the 30 bytes from start character 1 up to data 13 low byte.
# Host commands are 7 bytes: 0x42 0x4D CMD DATAH DATAL LRCH LRCL, LRC = 16-bit sum of the first 5 bytes.
import time

_START = b'\x42\x4d'
_FRAME_LEN = 32


def _command(cmd, datah, datal):
    body = bytes((0x42, 0x4D, cmd, datah, datal))
    s = sum(body) & 0xFFFF
    return body + bytes((s >> 8, s & 0xFF))


class PMS7003:
    def __init__(self, uart, set_pin=None, reset_pin=None):
        """uart: a machine.UART at 9600 baud whose RX is wired to the sensor's TX.
        set_pin / reset_pin: optional machine.Pin outputs wired to SET / RESET (both pulled up inside)."""
        self.uart = uart
        self.set_pin = set_pin
        self.reset_pin = reset_pin
        self._buf = b''

    def _frame(self, timeout_ms):
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            n = self.uart.any()
            if n:
                got = self.uart.read(n)
                if got:
                    self._buf += got
            else:
                time.sleep_ms(10)
            while True:
                i = self._buf.find(_START)
                if i < 0:
                    self._buf = self._buf[-1:]  # keep a trailing 0x42
                    break
                self._buf = self._buf[i:]
                if len(self._buf) < _FRAME_LEN:
                    break
                f = self._buf[:_FRAME_LEN]
                length = (f[2] << 8) | f[3]
                check = (f[30] << 8) | f[31]
                if length == 2 * 13 + 2 and (sum(f[:30]) & 0xFFFF) == check:
                    self._buf = self._buf[_FRAME_LEN:]
                    return f
                self._buf = self._buf[2:]  # false start or corrupted frame: resync
        raise OSError('PMS7003: no valid frame (check the TX wire, the supply, and that SET is not low)')

    def read(self, timeout_ms=5000):
        """Wait for the next checksum-valid frame and return its readings as a dict.
        pm1_0 / pm2_5 / pm10: 'under atmospheric environment' values (data 4-6, ug/m3);
        *_cf1: CF=1 'standard particle' values (data 1-3, ug/m3, for factory use);
        n0_3 ... n10: particles beyond that diameter (um) in 0.1 L of air (data 7-12)."""
        f = self._frame(timeout_ms)
        w = [(f[4 + 2 * k] << 8) | f[5 + 2 * k] for k in range(13)]
        return {
            'pm1_0_cf1': w[0], 'pm2_5_cf1': w[1], 'pm10_cf1': w[2],
            'pm1_0': w[3], 'pm2_5': w[4], 'pm10': w[5],
            'n0_3': w[6], 'n0_5': w[7], 'n1_0': w[8], 'n2_5': w[9], 'n5_0': w[10], 'n10': w[11],
        }

    def flush(self):
        """Throw away buffered (possibly stale) bytes."""
        while self.uart.any():
            self.uart.read(self.uart.any())
        self._buf = b''

    # ---- commands (Appendix II); need the sensor's RX wired to the UART TX ----
    def passive_mode(self):
        self.uart.write(_command(0xE1, 0x00, 0x00))

    def active_mode(self):
        self.uart.write(_command(0xE1, 0x00, 0x01))

    def request(self, timeout_ms=5000):
        """Passive mode: ask for one frame (command 0xE2) and return its readings."""
        self.flush()
        self.uart.write(_command(0xE2, 0x00, 0x00))
        return self.read(timeout_ms)

    def sleep(self):
        """Stop the fan and laser (standby <= 200 uA). Uses the SET pin if given, else command 0xE4 00."""
        if self.set_pin is not None:
            self.set_pin.value(0)
        else:
            self.uart.write(_command(0xE4, 0x00, 0x00))

    def wake(self):
        """Restart the fan. Data is only stable at least 30 s after waking."""
        if self.set_pin is not None:
            self.set_pin.value(1)
        else:
            self.uart.write(_command(0xE4, 0x00, 0x01))

    def reset(self):
        """Pulse RESET low (needs reset_pin)."""
        if self.reset_pin is not None:
            self.reset_pin.value(0)
            time.sleep_ms(100)
            self.reset_pin.value(1)
