# SCD41 CO2, temperature & humidity sensor (Sensirion SCD4x family), MicroPython driver.
# Uses the SCD41-only single shot mode (SCD4x datasheet v1.5, section 3.10):
#   stop_periodic_measurement 0x3F86 (500 ms), measure_single_shot 0x219D (5000 ms),
#   measure_single_shot_rht_only 0x2196 (50 ms), get_data_ready_status 0xE4B8,
#   read_measurement 0xEC05, power_down 0x36E0, wake_up 0x36F6 (not acknowledged, 30 ms).
# Periodic mode (start_periodic_measurement 0x21B1, one reading every 5 s) is also available.
# Every 16-bit word the sensor sends is followed by a CRC-8 (poly 0x31, init 0xFF).
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SCD41:
    def __init__(self, i2c, addr=0x62):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(30)  # power-up time is up to 30 ms
        # The sensor may still be in periodic mode from an earlier run: put it back to idle.
        self._cmd(0x3F86)
        time.sleep_ms(500)  # stop_periodic_measurement takes up to 500 ms
        # Datasheet: after a power cycle the first single shot reading should be discarded.
        self._discard = True

    def _cmd(self, cmd):
        self.i2c.writeto(self.addr, bytes([cmd >> 8, cmd & 0xFF]))

    def _read_words(self, cmd, n):
        self._cmd(cmd)
        time.sleep_ms(1)  # command execution time 1 ms
        d = self.i2c.readfrom(self.addr, 3 * n)
        words = []
        for i in range(n):
            if _crc8(d[3 * i:3 * i + 2]) != d[3 * i + 2]:
                raise OSError('SCD41 CRC mismatch: check the wiring')
            words.append((d[3 * i] << 8) | d[3 * i + 1])
        return words

    def data_ready(self):
        # Data ready when the least significant 11 bits of the status word are not 0.
        return (self._read_words(0xE4B8, 1)[0] & 0x07FF) != 0

    def _fetch(self, timeout_ms=1000):
        t0 = time.ticks_ms()
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('SCD41: no measurement ready')
            time.sleep_ms(50)
        co2, t_raw, h_raw = self._read_words(0xEC05, 3)
        return co2, -45 + 175 * t_raw / 65535, 100 * h_raw / 65535

    def _single_shot(self):
        self._cmd(0x219D)
        time.sleep_ms(5000)  # measure_single_shot max. duration 5000 ms
        return self._fetch()

    def read(self):
        """Take one on-demand reading (about 5 s; 10 s the first time).
        Returns (CO2 in ppm, temperature in °C, relative humidity in %)."""
        if self._discard:
            self._single_shot()  # first reading after power-up is less accurate
            self._discard = False
        return self._single_shot()

    def read_rht_only(self):
        """Fast (50 ms) temperature and humidity reading; CO2 is returned as 0."""
        self._cmd(0x2196)
        time.sleep_ms(50)
        return self._fetch()

    def power_down(self):
        self._cmd(0x36E0)
        time.sleep_ms(1)

    def wake_up(self):
        try:
            self._cmd(0x36F6)  # the sensor does not acknowledge wake_up
        except OSError:
            pass
        time.sleep_ms(30)
        self._discard = True
