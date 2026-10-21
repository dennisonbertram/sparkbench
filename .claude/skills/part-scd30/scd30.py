# SCD30 CO2, temperature & humidity sensor module (Sensirion), MicroPython driver.
# I2C protocol from the SCD30 Interface Description v1.0 (May 2020):
#   address 0x61, max 100 kHz (50 kHz recommended), the master must allow clock stretching
#   (30 ms normally, up to 150 ms about once a day), no repeated start.
#   trigger_continuous_measurement 0x0010 + pressure [mbar] (0 = no compensation)
#   stop_continuous_measurement    0x0104
#   set_measurement_interval       0x4600 + seconds (2...1800)
#   get_data_ready_status          0x0202 -> 1 when a new reading is waiting
#   read_measurement               0x0300 -> CO2, T, RH as big-endian IEEE-754 floats
# Every 16-bit word, in either direction, is followed by a CRC-8 (poly 0x31, init 0xFF).
# Wait more than 3 ms between writing a command and reading its answer.
import struct
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SCD30:
    def __init__(self, i2c, addr=0x61, pressure=0, interval=None, start=True):
        self.i2c = i2c
        self.addr = addr
        if interval is not None:
            self.set_interval(interval)
        if start:
            self.start(pressure)

    def _write(self, cmd, arg=None):
        buf = bytes([cmd >> 8, cmd & 0xFF])
        if arg is not None:
            a = bytes([(arg >> 8) & 0xFF, arg & 0xFF])
            buf += a + bytes([_crc8(a)])
        # The sensor boots in under 2 s and NACKs until then; it may also stretch the
        # clock beyond the I2C timeout during its daily calibration. Retry for up to 2 s.
        t0 = time.ticks_ms()
        while True:
            try:
                self.i2c.writeto(self.addr, buf)
                return
            except OSError:
                if time.ticks_diff(time.ticks_ms(), t0) > 2000:
                    raise
                time.sleep_ms(100)

    def _read_words(self, cmd, n):
        self._write(cmd)
        time.sleep_ms(4)  # read header must follow the write by more than 3 ms
        d = self.i2c.readfrom(self.addr, 3 * n)
        out = bytearray()
        for i in range(n):
            w = d[3 * i:3 * i + 2]
            if _crc8(w) != d[3 * i + 2]:
                raise OSError('SCD30 CRC mismatch: check the wiring')
            out += w
        return out

    def start(self, pressure=0):
        """Start continuous measurement; pressure in mbar (700-1400) or 0 for none."""
        self._write(0x0010, pressure)

    def stop(self):
        self._write(0x0104)

    def set_interval(self, seconds):
        """Measurement interval, 2-1800 s (stored in the sensor's flash)."""
        self._write(0x4600, seconds)

    def set_auto_calibration(self, on):
        self._write(0x5306, 1 if on else 0)

    def set_temperature_offset(self, degrees):
        """Offset subtracted from the temperature, in °C (unit 0.01 °C)."""
        self._write(0x5403, max(0, round(degrees * 100)))

    def set_altitude(self, metres):
        self._write(0x5102, metres)

    def force_recalibration(self, ppm):
        """Tell the sensor the true CO2 level now (400-2000 ppm)."""
        self._write(0x5204, ppm)

    def firmware(self):
        d = self._read_words(0xD100, 1)
        return d[0], d[1]

    def soft_reset(self):
        self._write(0xD304)

    def data_ready(self):
        d = self._read_words(0x0202, 1)
        return ((d[0] << 8) | d[1]) == 1

    def read(self, timeout_ms=5000):
        """Wait for the next reading and return (CO2 in ppm, temperature in °C, relative humidity in %)."""
        t0 = time.ticks_ms()
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('SCD30: no measurement ready (was start() called?)')
            time.sleep_ms(100)
        d = self._read_words(0x0300, 6)
        return struct.unpack('>fff', d)
