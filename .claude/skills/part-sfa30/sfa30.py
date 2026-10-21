# Sensirion SFA30 formaldehyde (HCHO) sensor module, MicroPython driver (I2C mode).
# Written from "Description of the SFA30 I2C Interface" (Sensirion app note V1.0, July 2022):
# address 0x5D, 16-bit commands sent MSB first without CRC, every 2-byte data word followed by a
# CRC-8 (poly 0x31, init 0xFF), 100 kHz max, wait ~5 ms between a command and its read.
# The SEL pin must be tied to GND before (or when) the module powers up to select I2C.
import time

_START = 0x0006   # start continuous measurement (only from idle mode)
_STOP = 0x0104    # stop continuous measurement
_READ = 0x0327    # read measured values: 3 x (int16 + CRC)
_MARKING = 0xD060 # device marking string, 16 words
_RESET = 0xD304   # soft reset


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _i16(hi, lo):
    v = (hi << 8) | lo
    return v - 0x10000 if v & 0x8000 else v


class SFA30:
    def __init__(self, i2c, addr=0x5D):
        self.i2c = i2c
        self.addr = addr

    def _cmd(self, cmd):
        self.i2c.writeto(self.addr, bytes([cmd >> 8, cmd & 0xFF]))

    def _read_words(self, cmd, n_words):
        self._cmd(cmd)
        time.sleep_ms(5)  # sensor needs time to fill its read buffer
        d = self.i2c.readfrom(self.addr, n_words * 3)
        out = []
        for i in range(0, n_words * 3, 3):
            if _crc8(d[i:i + 2]) != d[i + 2]:
                raise OSError('SFA30 CRC mismatch: check wiring, pull-ups and cable length')
            out.append((d[i], d[i + 1]))
        return out

    def start(self):
        """Enter measurement mode. A new value is ready every 0.5 s; the HCHO output reads 0
        for the first 10 s after power-up."""
        self._cmd(_START)
        time.sleep_ms(600)  # no result exists for the first 0.5 s

    def stop(self):
        self._cmd(_STOP)
        time.sleep_ms(5)

    def reset(self):
        self._cmd(_RESET)
        time.sleep_ms(100)

    def read(self):
        """Return (formaldehyde in ppb, relative humidity in %RH, temperature in degC).
        Values are averages of all 0.5 s measurements since the previous read."""
        w = self._read_words(_READ, 3)
        hcho = _i16(*w[0]) / 5.0
        rh = _i16(*w[1]) / 100.0
        t = _i16(*w[2]) / 200.0
        return hcho, rh, t

    def device_marking(self):
        w = self._read_words(_MARKING, 16)
        s = bytes(b for pair in w for b in pair)
        return s.split(b'\x00')[0].decode()
