# Plantower PMS3003 (G3) particulate matter sensor, MicroPython driver.
# Written from the PMS3003 data manual (digital pin table and serial frame table):
# 9600 baud, 8N1, 3.3 V TTL. The sensor sends 24-byte frames by itself:
#   0x42 0x4D, frame length (2 bytes, = 2x9+2 = 20), 9 big-endian 16-bit data words, 16-bit checksum,
#   checksum = start character 1 + start character 2 + ... + data 9 low byte (the first 22 bytes).
#   Data 1-3: PM1.0 / PM2.5 / PM10 CF=1 (standard particle, ug/m3)
#   Data 4-6: PM1.0 / PM2.5 / PM10 under atmospheric environment (ug/m3)
#   Data 7-9: reserved
# The PMS3003 has no passive mode and no serial commands: sleep and reset use the SET and RESET pins.
import time

_START = b'\x42\x4d'
_FRAME_LEN = 24


class PMS3003:
    def __init__(self, uart, set_pin=None, reset_pin=None):
        """uart: a machine.UART at 9600 baud whose RX is wired to the sensor's TXD.
        set_pin / reset_pin: optional machine.Pin outputs wired to SET / RESET (3.3 V logic)."""
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
                check = (f[22] << 8) | f[23]
                if length == 2 * 9 + 2 and (sum(f[:22]) & 0xFFFF) == check:
                    self._buf = self._buf[_FRAME_LEN:]
                    return f
                self._buf = self._buf[2:]  # false start or corrupted frame: resync
        raise OSError('PMS3003: no valid frame (check the TXD wire, 5 V on VCC, and that SET is not low)')

    def read(self, timeout_ms=3000):
        """Wait for the next valid frame and return a dict of its readings (ug/m3).
        pm1_0 / pm2_5 / pm10 are the 'atmospheric environment' values (data 4-6);
        *_cf1 are the CF=1 standard-particle values (data 1-3)."""
        f = self._frame(timeout_ms)
        w = [(f[4 + 2 * k] << 8) | f[5 + 2 * k] for k in range(9)]
        return {
            'pm1_0_cf1': w[0], 'pm2_5_cf1': w[1], 'pm10_cf1': w[2],
            'pm1_0': w[3], 'pm2_5': w[4], 'pm10': w[5],
        }

    def flush(self):
        """Throw away buffered (possibly stale) bytes."""
        while self.uart.any():
            self.uart.read(self.uart.any())
        self._buf = b''

    def sleep(self):
        """SET low: fan and laser stop (standby current only). Needs set_pin."""
        if self.set_pin is None:
            raise ValueError('PMS3003 sleep needs set_pin (the sensor has no sleep command)')
        self.set_pin.value(0)

    def wake(self):
        """SET high: run. Readings settle about 30 s after the fan restarts."""
        if self.set_pin is None:
            raise ValueError('PMS3003 wake needs set_pin')
        self.set_pin.value(1)

    def reset(self):
        """Pulse RESET low. Needs reset_pin."""
        if self.reset_pin is None:
            raise ValueError('PMS3003 reset needs reset_pin')
        self.reset_pin.value(0)
        time.sleep_ms(100)
        self.reset_pin.value(1)
