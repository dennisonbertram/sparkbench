# SHT35 temperature & humidity sensor (Sensirion SHT3x-DIS family), MicroPython driver.
# Single-shot, high-repeatability measurement without clock stretching (command 0x2400),
# CRC-8 checked as in the datasheet (poly 0x31, init 0xFF; 0xBEEF -> 0x92).
# The Seeed Grove SHT35 board ties ADDR to VCC, so its default address is 0x45.
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SHT35:
    def __init__(self, i2c, addr=0x45):
        self.i2c = i2c
        self.addr = addr

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self.i2c.writeto(self.addr, b'\x24\x00')
        time.sleep_ms(20)  # high repeatability takes up to 15.5 ms
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('SHT35 CRC mismatch: check the wiring')
        t_raw = (d[0] << 8) | d[1]
        h_raw = (d[3] << 8) | d[4]
        return -45 + 175 * t_raw / 65535, 100 * h_raw / 65535

    def soft_reset(self):
        self.i2c.writeto(self.addr, b'\x30\xa2')
        time.sleep_ms(2)

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
