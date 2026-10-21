# Sensirion SEN54 environmental sensor node (PM / RH / T / VOC Index), MicroPython driver.
# Written from the SEN5x datasheet (Version 2, March 2022), section 6: I2C address 0x69, max 100 kHz,
# no clock stretching. Commands are 16-bit pointers sent MSB first without CRC; every 2 data bytes
# are followed by a CRC-8 (poly 0x31, init 0xFF, CRC(0xBEEF) = 0x92).
# The SEN54 has no NOx sensor: the NOx word of "Read Measured Values" is always "unknown".
import time

FIELDS = ('pm1_0', 'pm2_5', 'pm4_0', 'pm10',   # mass concentration, ug/m3 (uint16, /10)
          'humidity',                          # compensated ambient RH, % (int16, /100)
          'temperature',                       # compensated ambient temperature, degC (int16, /200)
          'voc_index',                         # VOC Index, 1..500 (int16, /10)
          'nox_index')                         # NOx Index: always unknown (None) on the SEN54
_SCALE = (10, 10, 10, 10, 100, 200, 10, 10)
_SIGNED = (False, False, False, False, True, True, True, True)


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SEN54:
    def __init__(self, i2c, addr=0x69):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(50)  # start-up time after power-on before I2C may be used (max 50 ms)

    def _cmd(self, ptr, data=b''):
        buf = bytearray([ptr >> 8, ptr & 0xFF])
        for i in range(0, len(data), 2):
            w = data[i:i + 2]
            buf += w + bytes([_crc8(w)])
        self.i2c.writeto(self.addr, buf)

    def _read(self, ptr, n_words, wait_ms=20):
        self._cmd(ptr)
        time.sleep_ms(wait_ms)  # datasheet: wait 20 ms before the read header
        d = self.i2c.readfrom(self.addr, n_words * 3)
        out = []
        for i in range(0, n_words * 3, 3):
            if _crc8(d[i:i + 2]) != d[i + 2]:
                raise OSError('SEN54 CRC mismatch: check wiring and 100 kHz bus speed')
            out.append((d[i] << 8) | d[i + 1])
        return out

    def start(self):
        """Enter Measurement-Mode (PM, RH/T and VOC; fan and laser on)."""
        self._cmd(0x0021)
        time.sleep_ms(50)

    def start_rht_gas_only(self):
        """Measure RH/T/VOC only (fan and laser off); PM values read as unknown."""
        self._cmd(0x0037)
        time.sleep_ms(50)

    def stop(self):
        self._cmd(0x0104)
        time.sleep_ms(200)

    def reset(self):
        self._cmd(0xD304)
        time.sleep_ms(100)

    def start_fan_cleaning(self):
        self._cmd(0x5607)
        time.sleep_ms(20)

    def device_status(self):
        w = self._read(0xD206, 2)
        return (w[0] << 16) | w[1]

    def data_ready(self):
        return (self._read(0x0202, 1)[0] & 0xFF) == 0x01

    def read(self, timeout_ms=3000):
        """Wait for a new measurement (one per second) and return a dict of the eight values.
        A value the sensor does not know (always NOx on the SEN54) is None."""
        t0 = time.ticks_ms()
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('SEN54: no data (was start() called?)')
            time.sleep_ms(100)
        raw = self._read(0x03C4, 8)
        out = {}
        for name, r, scale, signed in zip(FIELDS, raw, _SCALE, _SIGNED):
            # Unknown: 0xFFFF (datasheet), 0x7FFF for int16 fields (Sensirion driver docs)
            if r == 0xFFFF or (signed and r == 0x7FFF):
                out[name] = None
                continue
            if signed and r & 0x8000:
                r -= 0x10000
            out[name] = r / scale
        return out
