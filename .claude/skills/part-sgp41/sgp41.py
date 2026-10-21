# SGP41 VOC + NOx gas sensor (Sensirion SGP41), MicroPython driver.
# From the SGP41 datasheet v1.0 (Dec 2021), I2C address 0x59:
#   sgp41_execute_conditioning 0x26 0x12 + RH word + CRC + T word + CRC, wait 50 ms, read 3 bytes (SRAW_VOC)
#   sgp41_measure_raw_signals  0x26 0x19 + RH word + CRC + T word + CRC, wait 50 ms, read 6 bytes
#                              (SRAW_VOC + CRC, SRAW_NOX + CRC)
#   sgp41_execute_self_test    0x28 0x0E, wait 320 ms, read 3 bytes (low byte bit0 = VOC fail, bit1 = NOx fail)
#   sgp4x_turn_heater_off      0x36 0x15 (back to idle)
#   sgp4x_get_serial_number    0x36 0x82, wait 1 ms, read 9 bytes (3 words + CRC each)
# Every 16-bit word (sent or received) is followed by a CRC-8 (poly 0x31, init 0xFF).
# After power-up or heater-off, run conditioning (recommended 10 s, NEVER more than 10 s) before
# the first measure_raw(). The raw signals are in ticks, proportional to the logarithm of each
# sensing layer's resistance: SRAW_VOC falls when VOCs rise, SRAW_NOX rises when NOx rises.
# VOC/NOx Index (1-500) needs Sensirion's Gas Index Algorithm (github.com/Sensirion/gas-index-algorithm),
# fed once a second; it is not included here.
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _word(v):
    v = max(0, min(65535, int(v)))
    b = bytes([v >> 8, v & 0xFF])
    return b + bytes([_crc8(b)])


def _comp(humidity, temperature):
    if humidity is None or temperature is None:
        return _word(0x8000) + _word(0x6666)  # datasheet defaults (50 %RH, 25 C): compensation off
    rh = round(humidity * 65535 / 100)
    t = round((temperature + 45) * 65535 / 175)
    return _word(rh) + _word(t)


class SGP41:
    def __init__(self, i2c, addr=0x59):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time is at most 0.6 ms

    def _read_words(self, cmd, wait_ms, n):
        self.i2c.writeto(self.addr, cmd)
        time.sleep_ms(wait_ms)
        d = self.i2c.readfrom(self.addr, 3 * n)
        out = []
        for i in range(0, 3 * n, 3):
            if _crc8(d[i:i + 2]) != d[i + 2]:
                raise OSError('SGP41 CRC mismatch: check the wiring')
            out.append((d[i] << 8) | d[i + 1])
        return out

    def condition_once(self, humidity=None, temperature=None):
        """One sgp41_execute_conditioning call; returns SRAW_VOC in ticks.

        Call it about once a second, for 10 s in total (never longer: the datasheet warns
        that conditioning beyond 10 s damages the NOx sensing material), then switch to
        measure_raw(). The datasheet asks for the default RH/T values here.
        """
        return self._read_words(b'\x26\x12' + _comp(humidity, temperature), 50, 1)[0]

    def condition(self, seconds=10):
        """Run the conditioning for `seconds` (1-10, default the recommended 10 s)."""
        seconds = max(1, min(10, int(seconds)))
        for i in range(seconds):
            t0 = time.ticks_ms()
            self.condition_once()
            if i < seconds - 1:
                time.sleep_ms(max(0, 1000 - time.ticks_diff(time.ticks_ms(), t0)))

    def measure_raw(self, humidity=None, temperature=None):
        """One VOC+NOx measurement: returns (SRAW_VOC, SRAW_NOX) in ticks.

        Pass relative humidity (%) and temperature (C) from e.g. an SHT40 to switch on the
        chip's humidity compensation; without them the defaults leave it off.
        Call about once a second; the heaters stay on between calls.
        """
        voc, nox = self._read_words(b'\x26\x19' + _comp(humidity, temperature), 50, 2)
        return voc, nox

    def self_test(self):
        """Built-in self-test (run it from idle, not during conditioning).
        Returns (voc_ok, nox_ok)."""
        r = self._read_words(b'\x28\x0e', 320, 1)[0]
        return (r & 0x01) == 0, (r & 0x02) == 0

    def serial_number(self):
        """48-bit unique serial number."""
        w = self._read_words(b'\x36\x82', 1, 3)
        return (w[0] << 32) | (w[1] << 16) | w[2]

    def heater_off(self):
        """Switch the hotplates off and return to idle (about 34 uA).
        Run conditioning again before the next measure_raw()."""
        self.i2c.writeto(self.addr, b'\x36\x15')
        time.sleep_ms(1)
