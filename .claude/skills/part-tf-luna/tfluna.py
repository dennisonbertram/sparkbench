# Benewake TF-Luna LiDAR distance sensor, UART mode (pin 5 left open), MicroPython driver.
# From the TF-Luna user manual (Benewake, REV 01/04/2024): 115200 baud 8N1; by default the
# sensor streams the 9-byte/cm frame 100 times a second:
#   0x59 0x59 Dist_L Dist_H Amp_L Amp_H Temp_L Temp_H Checksum
# Checksum = low 8 bits of the sum of bytes 0..7. Dist in cm, Amp = signal strength,
# chip temperature = Temp / 8 - 256 degC. Dist is unreliable when Amp < 100 or Amp == 65535.
import time


class TFLuna:
    def __init__(self, uart):
        self.uart = uart  # UART(id, baudrate=115200, tx=..., rx=...)

    def read(self, timeout_ms=500):
        """Wait for the next valid frame; return (distance_cm, amp, temperature_C)."""
        self.uart.read()  # drop stale frames queued since the last call
        buf = b''
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            n = self.uart.any()
            if n:
                buf += self.uart.read(n)
            while len(buf) >= 9:
                if buf[0] == 0x59 and buf[1] == 0x59 and (sum(buf[0:8]) & 0xFF) == buf[8]:
                    dist = buf[2] | (buf[3] << 8)
                    amp = buf[4] | (buf[5] << 8)
                    temp = (buf[6] | (buf[7] << 8)) / 8 - 256
                    return dist, amp, temp
                buf = buf[1:]  # not a frame start (or bad checksum): resync
            time.sleep_ms(2)
        raise OSError('TF-Luna: no valid frame (check TXD wiring, 115200 baud, pin 5 not grounded)')

    def distance(self):
        """Distance in cm, or None when the signal is too weak or overexposed."""
        d, amp, _ = self.read()
        return None if amp < 100 or amp == 0xFFFF else d

    def _cmd(self, body):
        frame = bytes([0x5A, len(body) + 3]) + bytes(body)
        self.uart.write(frame + bytes([sum(frame) & 0xFF]))

    def set_frame_rate(self, hz):
        """ID_SAMPLE_FREQ (0x03): 1..250 Hz, 0 = trigger mode. Not saved until save()."""
        self._cmd([0x03, hz & 0xFF, hz >> 8])

    def save(self):
        """ID_SAVE_SETTINGS (0x11)."""
        self._cmd([0x11])
