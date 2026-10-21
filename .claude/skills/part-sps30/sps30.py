# Sensirion SPS30 particulate matter sensor, MicroPython driver (I2C mode).
# Written from the SPS30 datasheet (v2.0, June 2023), section 6: I2C address 0x69, 16-bit command
# pointers sent MSB first without CRC, a CRC-8 (poly 0x31, init 0xFF) after every 2 data bytes,
# max 100 kHz, no clock stretching. The SEL pin must be tied to GND before power-up to select I2C.
import struct
import time

FIELDS = ('pm1_0', 'pm2_5', 'pm4_0', 'pm10',            # mass concentration, ug/m3
          'nc0_5', 'nc1_0', 'nc2_5', 'nc4_0', 'nc10',    # number concentration, #/cm3
          'typical_size')                                # typical particle size, um


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SPS30:
    def __init__(self, i2c, addr=0x69):
        self.i2c = i2c
        self.addr = addr

    def _cmd(self, ptr, data=b''):
        buf = bytearray([ptr >> 8, ptr & 0xFF])
        for i in range(0, len(data), 2):
            w = data[i:i + 2]
            buf += w + bytes([_crc8(w)])
        self.i2c.writeto(self.addr, buf)

    def _read(self, ptr, n_words):
        self._cmd(ptr)
        d = self.i2c.readfrom(self.addr, n_words * 3)
        out = bytearray()
        for i in range(0, n_words * 3, 3):
            if _crc8(d[i:i + 2]) != d[i + 2]:
                raise OSError('SPS30 CRC mismatch: check the wiring and pull-ups')
            out += d[i:i + 2]
        return out

    def start(self):
        """Enter Measurement-Mode with big-endian IEEE754 float output (format 0x03)."""
        self._cmd(0x0010, b'\x03\x00')
        time.sleep_ms(20)

    def stop(self):
        self._cmd(0x0104)
        time.sleep_ms(20)

    def reset(self):
        self._cmd(0xD304)
        time.sleep_ms(100)

    def start_fan_cleaning(self):
        self._cmd(0x5607)
        time.sleep_ms(5)

    def data_ready(self):
        return self._read(0x0202, 1)[1] == 0x01

    def read(self, timeout_ms=3000):
        """Wait for a new measurement (one per second) and return a dict of the ten values."""
        t0 = time.ticks_ms()
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('SPS30: no data (was start() called?)')
            time.sleep_ms(100)
        raw = self._read(0x0300, 20)
        vals = struct.unpack('>10f', raw)
        return dict(zip(FIELDS, vals))
