# SGP40 VOC gas sensor (Sensirion SGP40), MicroPython driver.
# From the SGP40 datasheet v1.2 (Feb 2022), I2C address 0x59:
#   sgp40_measure_raw_signal 0x26 0x0F + RH word + CRC + T word + CRC, wait 30 ms, read 3 bytes
#   sgp40_execute_self_test  0x28 0x0E, wait 320 ms, read 3 bytes (0xD4xx = pass, 0x4Bxx = fail)
#   sgp4x_turn_heater_off    0x36 0x15 (back to idle)
# Every 16-bit word (sent or received) is followed by a CRC-8 (poly 0x31, init 0xFF).
# The result is SRAW_VOC in ticks (0-65535), proportional to the logarithm of the sensing
# layer's resistance: it goes DOWN when VOCs go up. Turning it into a 1-500 VOC Index needs
# Sensirion's Gas Index Algorithm (github.com/Sensirion/gas-index-algorithm), not included here.
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


class SGP40:
    def __init__(self, i2c, addr=0x59):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time is at most 0.6 ms

    def _read_word(self, cmd, wait_ms):
        self.i2c.writeto(self.addr, cmd)
        time.sleep_ms(wait_ms)
        d = self.i2c.readfrom(self.addr, 3)
        if _crc8(d[0:2]) != d[2]:
            raise OSError('SGP40 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def measure_raw(self, humidity=None, temperature=None):
        """One raw measurement, SRAW_VOC in ticks.

        Pass the air's relative humidity (%) and temperature (°C), e.g. from an SHT31 or
        SHT40, to switch on the chip's humidity compensation. Without them the datasheet
        default values (50 %RH, 25 °C) are sent, which leaves compensation off.
        Call about once a second; the heater stays on between calls.
        """
        if humidity is None or temperature is None:
            rh_ticks, t_ticks = 0x8000, 0x6666  # datasheet defaults: compensation disabled
        else:
            rh_ticks = round(humidity * 65535 / 100)
            t_ticks = round((temperature + 45) * 65535 / 175)
        cmd = b'\x26\x0f' + _word(rh_ticks) + _word(t_ticks)
        return self._read_word(cmd, 30)  # max execution time 30 ms

    def self_test(self):
        """Run the built-in hotplate/MOX self-test. Returns True if it passed."""
        return (self._read_word(b'\x28\x0e', 320) >> 8) == 0xD4

    def heater_off(self):
        """Switch the hotplate off and return to idle (about 34 uA)."""
        self.i2c.writeto(self.addr, b'\x36\x15')
        time.sleep_ms(1)
