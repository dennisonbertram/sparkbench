# SCD40 / SCD41 CO2, temperature & humidity sensor (Sensirion SCD4x), MicroPython driver.
# Periodic measurement mode (one new reading every 5 s), as in the SCD4x datasheet v1.5:
#   stop_periodic_measurement 0x3F86 (wait 500 ms), start_periodic_measurement 0x21B1,
#   get_data_ready_status 0xE4B8, read_measurement 0xEC05.
# Every 16-bit word the sensor sends is followed by a CRC-8 (poly 0x31, init 0xFF).
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SCD40:
    def __init__(self, i2c, addr=0x62, start=True):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(30)  # power-up time after reset is up to 30 ms
        if start:
            # The sensor may still be measuring from an earlier run: stop it first.
            self._cmd(0x3F86)
            time.sleep_ms(500)  # stop_periodic_measurement takes up to 500 ms
            self.start()

    def _cmd(self, cmd):
        self.i2c.writeto(self.addr, bytes([cmd >> 8, cmd & 0xFF]))

    def _read_words(self, cmd, n):
        self._cmd(cmd)
        time.sleep_ms(1)  # command execution time 1 ms
        d = self.i2c.readfrom(self.addr, 3 * n)
        words = []
        for i in range(n):
            if _crc8(d[3 * i:3 * i + 2]) != d[3 * i + 2]:
                raise OSError('SCD40 CRC mismatch: check the wiring')
            words.append((d[3 * i] << 8) | d[3 * i + 1])
        return words

    def start(self):
        """Start periodic measurement: a new reading every 5 seconds."""
        self._cmd(0x21B1)

    def stop(self):
        self._cmd(0x3F86)
        time.sleep_ms(500)

    def data_ready(self):
        # Data ready when the least significant 11 bits of the status word are not 0.
        return (self._read_words(0xE4B8, 1)[0] & 0x07FF) != 0

    def read(self, timeout_ms=7000):
        """Wait for the next reading and return (CO2 in ppm, temperature in °C, relative humidity in %)."""
        t0 = time.ticks_ms()
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('SCD40: no measurement ready (was start() called?)')
            time.sleep_ms(100)
        co2, t_raw, h_raw = self._read_words(0xEC05, 3)
        return co2, -45 + 175 * t_raw / 65535, 100 * h_raw / 65535
