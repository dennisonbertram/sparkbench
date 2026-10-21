# SGP30 indoor air quality sensor (Sensirion SGP30, datasheet v1.0 May 2020), MicroPython driver.
# I2C address 0x58. 16-bit commands; every 16-bit word the chip sends is followed by a CRC-8
# (poly 0x31, init 0xFF), and every data word written to it must carry the same CRC.
# After iaq_init() call measure() once per second: the on-chip baseline algorithm relies on it.
# For the first 15 s after iaq_init() the chip returns fixed values 400 ppm eCO2 / 0 ppb TVOC.
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SGP30:
    def __init__(self, i2c, addr=0x58, init=True):
        self.i2c = i2c
        self.addr = addr
        fs = self.feature_set()
        if fs >> 12 != 0:  # product type nibble: 0 = SGP30
            raise OSError('not an SGP30 (feature set 0x%04x)' % fs)
        if init:
            self.iaq_init()

    def _cmd(self, cmd, delay_ms, nwords=0, data=None):
        buf = bytearray([cmd >> 8, cmd & 0xFF])
        for w in data or ():
            wb = bytes([w >> 8, w & 0xFF])
            buf += wb + bytes([_crc8(wb)])
        self.i2c.writeto(self.addr, buf)
        time.sleep_ms(delay_ms)
        if not nwords:
            return []
        d = self.i2c.readfrom(self.addr, 3 * nwords)
        out = []
        for i in range(0, 3 * nwords, 3):
            if _crc8(d[i:i + 2]) != d[i + 2]:
                raise OSError('SGP30 CRC mismatch: check the wiring')
            out.append((d[i] << 8) | d[i + 1])
        return out

    def feature_set(self):
        """sgp30_get_feature_set (0x202F): product type in the top 4 bits, version in the low byte."""
        return self._cmd(0x202F, 10, 1)[0]

    def iaq_init(self):
        """sgp30_iaq_init (0x2003): start air-quality mode. Needed after every power-up or reset."""
        self._cmd(0x2003, 10)

    def measure(self):
        """sgp30_measure_iaq (0x2008): return (eCO2 in ppm, TVOC in ppb). Call once per second."""
        co2, tvoc = self._cmd(0x2008, 12, 2)
        return co2, tvoc

    def measure_raw(self):
        """sgp30_measure_raw (0x2050): raw (H2, ethanol) signals, for testing."""
        h2, eth = self._cmd(0x2050, 25, 2)
        return h2, eth

    def get_baseline(self):
        """sgp30_get_iaq_baseline (0x2015): (eCO2 baseline, TVOC baseline) to save."""
        co2, tvoc = self._cmd(0x2015, 10, 2)
        return co2, tvoc

    def set_baseline(self, co2_base, tvoc_base):
        """sgp30_set_iaq_baseline (0x201E): restore after iaq_init(). Sent in the order TVOC, eCO2."""
        self._cmd(0x201E, 10, 0, (tvoc_base, co2_base))

    def set_absolute_humidity(self, grams_per_m3):
        """sgp30_set_absolute_humidity (0x2061): 8.8 fixed point g/m3; 0 turns compensation off."""
        v = int(round(grams_per_m3 * 256))
        v = max(0, min(0xFFFF, v))
        self._cmd(0x2061, 10, 0, (v,))

    def set_humidity(self, temp_c, rh):
        """Humidity compensation from a temperature (°C) and relative humidity (%) sensor."""
        import math
        ah = 216.7 * (rh / 100 * 6.112 * math.exp(17.62 * temp_c / (243.12 + temp_c)) / (273.15 + temp_c))
        self.set_absolute_humidity(ah)
