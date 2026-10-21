# Benewake TFmini-S LiDAR distance sensor (UART mode), MicroPython driver.
# Written from the Benewake "SJ-PM-TFmini-S A01 Product Manual":
# UART 115200 baud, 8N1 (Table 6). In the default standard format the sensor sends a 9-byte frame
# by itself at the frame rate (100 Hz by default):
#   0x59 0x59 Dist_L Dist_H Strength_L Strength_H Temp_L Temp_H Checksum
#   checksum = low 8 bits of the sum of the first 8 bytes (Table 7).
# Dist is in cm (0-2000 range of the field); 65535 (-1) = strength < 100, 65534 (-2) = strength
# saturated, 65532 (-4) = ambient light saturated (Table 8). Chip temperature in C = Temp / 8 - 256.
# Host commands (section 7.3): 0x5A, total length, ID, little-endian payload, then the low 8 bits
# of the sum of all previous bytes.
import time

_HEAD = 0x59
_FRAME_LEN = 9
_INVALID = {65535: 'weak signal (strength < 100)', 65534: 'signal saturated', 65532: 'ambient light saturated'}


def _command(cmd_id, payload=b''):
    body = bytes((0x5A, len(payload) + 4, cmd_id)) + bytes(payload)
    return body + bytes((sum(body) & 0xFF,))


class TFminiS:
    def __init__(self, uart):
        """uart: a machine.UART at 115200 baud whose RX is wired to the sensor's TXD (green wire)."""
        self.uart = uart
        self._buf = b''
        self.error = None

    def flush(self):
        """Throw away buffered (stale) bytes so the next read returns a fresh frame."""
        n = self.uart.any()
        while n:
            self.uart.read(n)
            n = self.uart.any()
        self._buf = b''

    def _frame(self, timeout_ms):
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while True:
            # resync on 0x59 0x59 and check every candidate frame's checksum
            while len(self._buf) >= 2:
                if self._buf[0] != _HEAD or self._buf[1] != _HEAD:
                    self._buf = self._buf[1:]
                    continue
                if len(self._buf) < _FRAME_LEN:
                    break
                f = self._buf[:_FRAME_LEN]
                if sum(f[:8]) & 0xFF == f[8]:
                    self._buf = self._buf[_FRAME_LEN:]
                    return f
                self._buf = self._buf[1:]  # corrupted or false header: resync
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                raise OSError('TFmini-S: no valid frame (check TXD -> board RX, 5 V supply, 115200 baud)')
            n = self.uart.any()
            if n:
                got = self.uart.read(n)
                if got:
                    self._buf += got
            else:
                time.sleep_ms(2)

    def read(self, timeout_ms=500, fresh=True):
        """Return (distance_cm, strength, temperature_c) from the next valid frame.
        distance_cm is None when the sensor flags the reading as unreliable; self.error then says why.
        fresh=True drops bytes that piled up while the program was busy elsewhere."""
        if fresh:
            self.flush()
        f = self._frame(timeout_ms)
        dist = f[2] | (f[3] << 8)
        strength = f[4] | (f[5] << 8)
        temp_c = (f[6] | (f[7] << 8)) / 8 - 256
        self.error = _INVALID.get(dist)
        if self.error:
            dist = None
        return dist, strength, temp_c

    def distance(self, timeout_ms=500):
        """Distance in cm, or None if unreliable."""
        return self.read(timeout_ms)[0]

    # ---- configuration commands (Table 12); need the sensor's RXD (white wire) on the UART TX ----
    def _send(self, cmd_id, payload=b'', reply_len=0, timeout_ms=200):
        self.flush()
        frame = _command(cmd_id, payload)
        self.uart.write(frame)
        if not reply_len:
            return None
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        buf = b''
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n) or b''
                i = buf.find(bytes((0x5A, reply_len, cmd_id)))
                if i >= 0 and len(buf) >= i + reply_len:
                    r = buf[i:i + reply_len]
                    if sum(r[:-1]) & 0xFF == r[-1]:
                        return r
            else:
                time.sleep_ms(2)
        return None

    def version(self):
        """Firmware version as (major, minor, revision), or None."""
        r = self._send(0x01, b'', 7)
        return (r[5], r[4], r[3]) if r else None

    def set_frame_rate(self, hz):
        """Frame rate in Hz: 0 (triggered with trigger()) or 1000/n for a whole n, up to 1000. Call save() after."""
        return self._send(0x03, bytes((hz & 0xFF, hz >> 8)), 6) is not None

    def trigger(self):
        """With frame rate 0: ask for one measurement; then call read(fresh=False)."""
        self.flush()
        self.uart.write(_command(0x04))

    def output(self, enable):
        """Enable or disable the frame stream."""
        return self._send(0x07, bytes((1 if enable else 0,)), 5) is not None

    def save(self):
        """Store settings in flash (wait 1 s afterwards before power-off)."""
        r = self._send(0x11, b'', 5, 1000)
        time.sleep_ms(1000)
        return bool(r) and r[3] == 0

    def reset(self):
        """System reset (wait 1 s afterwards)."""
        r = self._send(0x02, b'', 5, 1000)
        time.sleep_ms(1000)
        return bool(r) and r[3] == 0

    def factory_reset(self):
        r = self._send(0x10, b'', 5, 1000)
        return bool(r) and r[3] == 0
