# DFRobot A02YYUW waterproof ultrasonic distance sensor (SEN0311, UART version), MicroPython driver.
# Written from the DFRobot SEN0311 wiki "Communication Protocol Description":
# UART 9600 baud, 8 data bits, no parity, 1 stop bit, TTL level. The sensor sends 4-byte frames
# by itself (about every 100 ms):
#   0xFF  DATA_H  DATA_L  SUM
#   distance in mm = DATA_H * 256 + DATA_L
#   SUM = (0xFF + DATA_H + DATA_L) & 0xFF   (low 8 bits of the sum)
# RX pin: left floating or held high -> processed (smoothed) value, 100-300 ms response;
#         held low -> real-time value, 100 ms response.
# Range 30-4500 mm (3 cm blind zone).
import time

_HEAD = 0xFF
_FRAME_LEN = 4


class A02YYUW:
    def __init__(self, uart):
        """uart: a machine.UART at 9600 baud whose RX is wired to the sensor's TX (white wire)."""
        self.uart = uart
        self._buf = b''

    def flush(self):
        """Drop buffered (stale) bytes so the next read returns a fresh frame."""
        n = self.uart.any()
        while n:
            self.uart.read(n)
            n = self.uart.any()
        self._buf = b''

    def _frame(self, timeout_ms):
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while True:
            # resync on the 0xFF header and verify each candidate frame's checksum
            while len(self._buf) >= 1:
                if self._buf[0] != _HEAD:
                    self._buf = self._buf[1:]
                    continue
                if len(self._buf) < _FRAME_LEN:
                    break
                f = self._buf[:_FRAME_LEN]
                if (f[0] + f[1] + f[2]) & 0xFF == f[3]:
                    self._buf = self._buf[_FRAME_LEN:]
                    return f
                self._buf = self._buf[1:]  # bad checksum or false header: resync
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                return None
            n = self.uart.any()
            if n:
                got = self.uart.read(n)
                if got:
                    self._buf += got
            else:
                time.sleep_ms(5)

    def distance_mm(self, timeout_ms=600, fresh=True):
        """Distance in mm from the next valid frame, or None if no valid frame arrived in time.
        fresh=True drops bytes that piled up while the program was busy elsewhere."""
        if fresh:
            self.flush()
        f = self._frame(timeout_ms)
        if f is None:
            return None
        return (f[1] << 8) | f[2]

    def distance_cm(self, timeout_ms=600):
        mm = self.distance_mm(timeout_ms)
        return None if mm is None else mm / 10
