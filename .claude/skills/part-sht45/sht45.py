# SHT45 precision temperature & humidity sensor (Sensirion SHT4x), MicroPython driver.
# Single-shot, high-precision measurement (command 0xFD, max 8.3 ms), CRC-8 checked as in the
# datasheet (poly 0x31, init 0xFF). Conversion: T = -45 + 175*S/65535 degC, RH = -6 + 125*S/65535 %,
# RH cropped to 0..100 % as the datasheet advises. Works for SHT40/SHT41/SHT45 alike.
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SHT45:
    def __init__(self, i2c, addr=0x44):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time, max 1 ms

    def _read6(self):
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('SHT45 CRC mismatch: check the wiring')
        return d

    def reset(self):
        """Soft reset (0x94); the sensor is idle again after at most 1 ms."""
        self.i2c.writeto(self.addr, b'\x94')
        time.sleep_ms(1)

    def serial_number(self):
        self.i2c.writeto(self.addr, b'\x89')
        time.sleep_ms(1)
        d = self._read6()
        return (d[0] << 24) | (d[1] << 16) | (d[3] << 8) | d[4]

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self.i2c.writeto(self.addr, b'\xfd')
        time.sleep_ms(10)  # high precision takes up to 8.3 ms
        d = self._read6()
        t_ticks = (d[0] << 8) | d[1]
        rh_ticks = (d[3] << 8) | d[4]
        t = -45 + 175 * t_ticks / 65535
        rh = -6 + 125 * rh_ticks / 65535
        rh = min(max(rh, 0.0), 100.0)
        return t, rh

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
