# SHTC3 temperature & humidity sensor (Sensirion SHTC3), MicroPython driver.
# Each reading follows the datasheet's measurement cycle: wake-up (0x3517), measure in normal
# mode, temperature first, no clock stretching (0x7866), read 6 bytes, sleep (0xB098).
# CRC-8 checked as in the datasheet (poly 0x31, init 0xFF).
# Conversion: T = -45 + 175 * S / 2^16 degC, RH = 100 * S / 2^16 %.
import time

_WAKEUP = b'\x35\x17'
_SLEEP = b'\xb0\x98'
_MEASURE_T_FIRST = b'\x78\x66'
_SOFT_RESET = b'\x80\x5d'
_READ_ID = b'\xef\xc8'


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SHTC3:
    def __init__(self, i2c, addr=0x70):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time, max 240 us
        ident = self.id()
        if ident & 0x083F != 0x0807:
            raise OSError('no SHTC3 found (ID 0x%04X)' % ident)

    def _wake(self):
        self.i2c.writeto(self.addr, _WAKEUP)
        time.sleep_us(300)  # wake-up time, max 240 us

    def _sleep(self):
        self.i2c.writeto(self.addr, _SLEEP)

    def id(self):
        """Read the 16-bit ID register (SHTC3: bits 11 and 5..0 read 1 000111)."""
        self._wake()
        self.i2c.writeto(self.addr, _READ_ID)
        d = self.i2c.readfrom(self.addr, 3)
        self._sleep()
        if _crc8(d[0:2]) != d[2]:
            raise OSError('SHTC3 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def reset(self):
        """Soft reset (0x805D); the sensor is idle again after at most 240 us."""
        self._wake()
        self.i2c.writeto(self.addr, _SOFT_RESET)
        time.sleep_us(300)
        self._sleep()

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self._wake()
        self.i2c.writeto(self.addr, _MEASURE_T_FIRST)
        time.sleep_ms(13)  # normal mode takes up to 12.1 ms
        d = self.i2c.readfrom(self.addr, 6)
        self._sleep()
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('SHTC3 CRC mismatch: check the wiring')
        t_raw = (d[0] << 8) | d[1]
        rh_raw = (d[3] << 8) | d[4]
        return -45 + 175 * t_raw / 65536, 100 * rh_raw / 65536

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
