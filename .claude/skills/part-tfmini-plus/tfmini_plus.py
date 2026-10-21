# Benewake TFmini Plus LiDAR distance sensor (UART mode), MicroPython driver.
# Written from the Benewake "SJ-PM-TFmini Plus-T-01 A01 Product Manual" and the
# "SJ-GU-TFmini-Plus-01 A02" datasheet:
# UART 115200 baud, 8N1 (Table 5). In the default standard format the sensor sends a 9-byte frame
# by itself at the frame rate (100 Hz by default):
#   0x59 0x59 Dist_L Dist_H Strength_L Strength_H Temp_L Temp_H Checksum
#   checksum = low 8 bits of the sum of the first 8 bytes.
# Dist is in cm by default (0-1200), or mm after the "output format 06" command.
# When the signal strength is below 100 or equal to 65535 the reading is unreliable and the
# sensor sets Dist to 0 (manual 5.3). Chip temperature in C = Temp / 8 - 256.
# Host commands (Table 7/8): 0x5A, total length, ID, little-endian payload, then the low 8 bits
# of the sum of all previous bytes. Send "save settings" after changing anything.
import time

_HEAD = 0x59
_FRAME_LEN = 9


def _command(cmd_id, payload=b''):
    body = bytes((0x5A, len(payload) + 4, cmd_id)) + bytes(payload)
    return body + bytes((sum(body) & 0xFF,))


class TFminiPlus:
    def __init__(self, uart):
        """uart: a machine.UART at 115200 baud whose RX is wired to the sensor's TXD (blue wire)."""
        self.uart = uart
        self._buf = b''
        self.unit = 'cm'
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
                raise OSError('TFmini Plus: no valid frame (check TXD -> board RX, 5 V supply, 115200 baud)')
            n = self.uart.any()
            if n:
                got = self.uart.read(n)
                if got:
                    self._buf += got
            else:
                time.sleep_ms(2)

    def read(self, timeout_ms=500, fresh=True):
        """Return (distance, strength, temperature_c) from the next valid frame.
        distance is in self.unit ('cm' by default) and is None when the sensor flags the reading as
        unreliable (it sends 0 when strength < 100 or = 65535); self.error then says why.
        fresh=True drops bytes that piled up while the program was busy elsewhere."""
        if fresh:
            self.flush()
        f = self._frame(timeout_ms)
        dist = f[2] | (f[3] << 8)
        strength = f[4] | (f[5] << 8)
        temp_c = (f[6] | (f[7] << 8)) / 8 - 256
        self.error = None
        if dist == 0 or strength < 100 or strength == 65535:
            self.error = 'unreliable (signal strength %d)' % strength
            dist = None
        return dist, strength, temp_c

    def distance(self, timeout_ms=500):
        """Distance in self.unit, or None if unreliable."""
        return self.read(timeout_ms)[0]

    # ---- configuration commands (Table 8); need the sensor's RXD (white wire) on the UART TX ----
    def _send(self, cmd_id, payload=b'', reply_len=0, timeout_ms=200):
        self.flush()
        self.uart.write(_command(cmd_id, payload))
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
        """Firmware version as (major, minor, revision), or None. Reply 5A 07 01 V1 V2 V3 SU = V3.V2.V1."""
        r = self._send(0x01, b'', 7)
        return (r[5], r[4], r[3]) if r else None

    def set_frame_rate(self, hz):
        """Frame rate in Hz: 0 (triggered with trigger()) or 1000/n for a whole n, 1-1000. Call save() after."""
        return self._send(0x03, bytes((hz & 0xFF, hz >> 8)), 6) is not None

    def trigger(self):
        """With frame rate 0: ask for one measurement; then call read(fresh=False)."""
        self.flush()
        self.uart.write(_command(0x04))

    def set_unit_mm(self, mm=True):
        """Standard 9-byte output in mm (True) or cm (False). Call save() after."""
        ok = self._send(0x05, bytes((0x06 if mm else 0x01,)), 5) is not None
        if ok:
            self.unit = 'mm' if mm else 'cm'
        return ok

    def output(self, enable):
        """Enable or disable the frame stream."""
        return self._send(0x07, bytes((1 if enable else 0,)), 5) is not None

    def save(self):
        """Store settings in flash."""
        r = self._send(0x11, b'', 5, 1000)
        return bool(r) and r[3] == 0

    def reset(self):
        """System reset (wait about 1 s afterwards)."""
        r = self._send(0x02, b'', 5, 1000)
        time.sleep_ms(1000)
        return bool(r) and r[3] == 0

    def factory_reset(self):
        r = self._send(0x10, b'', 5, 1000)
        return bool(r) and r[3] == 0
