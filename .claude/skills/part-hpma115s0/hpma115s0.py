# Honeywell HPMA115S0 laser PM2.5/PM10 sensor, MicroPython driver.
# UART 9600 8N1, 3.3 V TTL. Protocol from the Honeywell HPM Series datasheet 32322550 (Issue G):
# - Auto-send mode (factory default): 32-byte frames
#     42 4D LEN_H LEN_L(=0x001C) D0 D1(PM2.5) D2(PM10) D3..D12 CS_H CS_L
#   each Dn is big-endian 16 bits; checksum = 16-bit sum of bytes 0..29.
# - Commands: HEAD(0x68) LEN CMD [DATA] CS, CS = (65536 - (HEAD+LEN+CMD+DATA)) % 256.
#   Positive ACK = A5 A5, negative ACK = 96 96.
#   Read result reply: 40 05 04 DF1 DF2 DF3 DF4 CS; PM2.5 = DF1*256+DF2, PM10 = DF3*256+DF4.
import time


class HPMA115S0:
    def __init__(self, uart):
        self.uart = uart
        self._buf = b''

    def _poll(self):
        n = self.uart.any()
        if n:
            d = self.uart.read(n)
            if d:
                self._buf = (self._buf + d)[-128:]

    def read_auto(self):
        """Newest (pm2_5, pm10) in ug/m3 from auto-send frames, or None if no valid frame yet."""
        self._poll()
        b = self._buf
        result = None
        i = 0
        while i + 32 <= len(b):
            if b[i] == 0x42 and b[i + 1] == 0x4D and b[i + 2] == 0x00 and b[i + 3] == 0x1C:
                if sum(b[i:i + 30]) & 0xFFFF == (b[i + 30] << 8) | b[i + 31]:
                    result = ((b[i + 6] << 8) | b[i + 7], (b[i + 8] << 8) | b[i + 9])
                    i += 32
                    continue
            i += 1
        self._buf = b[i:]
        return result

    def read(self, timeout_ms=3000):
        """Wait for the next auto-send frame; returns (pm2_5, pm10) or None on timeout."""
        t = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t) < timeout_ms:
            r = self.read_auto()
            if r:
                return r
            time.sleep_ms(50)
        return None

    def _send(self, cmd, data=b''):
        frame = bytes([0x68, 1 + len(data), cmd]) + bytes(data)
        self.uart.write(frame + bytes([(65536 - sum(frame)) % 256]))

    def _reply(self, n, timeout_ms=1000):
        out = b''
        t = time.ticks_ms()
        while len(out) < n and time.ticks_diff(time.ticks_ms(), t) < timeout_ms:
            if self.uart.any():
                out += self.uart.read(n - len(out)) or b''
            else:
                time.sleep_ms(5)
        return out

    def _ack(self, cmd, data=b''):
        self.uart.read()  # drop anything pending (e.g. auto-send bytes)
        self._buf = b''
        self._send(cmd, data)
        return self._reply(2) == b'\xa5\xa5'

    def start(self):
        """Start the fan and measurement (0x01)."""
        return self._ack(0x01)

    def stop(self):
        """Stop measurement and the fan (0x02) to extend sensor life."""
        return self._ack(0x02)

    def stop_auto_send(self):
        """Switch to polled mode (0x20); then use read_measurement()."""
        ok = self._ack(0x20)
        time.sleep_ms(100)
        self.uart.read()
        return ok

    def enable_auto_send(self):
        """Back to the factory-default auto-send mode (0x40)."""
        return self._ack(0x40)

    def read_measurement(self):
        """Polled read (command 0x04, needs auto-send stopped). Returns (pm2_5, pm10) or None."""
        self.uart.read()
        self._send(0x04)
        r = self._reply(8)
        if len(r) == 8 and r[0] == 0x40 and r[1] == 0x05 and r[2] == 0x04:
            if (65536 - sum(r[0:7])) % 256 == r[7]:
                return ((r[3] << 8) | r[4], (r[5] << 8) | r[6])
        return None

    def set_coefficient(self, k):
        """Customer adjustment coefficient 30-200 (default 100) (0x08)."""
        return self._ack(0x08, bytes([max(30, min(200, int(k)))]))

    def read_coefficient(self):
        """Read the adjustment coefficient (0x10): reply 40 02 10 DF1 CS."""
        self.uart.read()
        self._send(0x10)
        r = self._reply(5)
        if len(r) == 5 and r[0] == 0x40 and r[1] == 0x02 and r[2] == 0x10 and (65536 - sum(r[0:4])) % 256 == r[4]:
            return r[3]
        return None
