# STS40 high-accuracy temperature sensor (Sensirion STS4x), MicroPython driver.
# Single-shot measurement: write one command byte, wait for the conversion, read 3 bytes
# (T MSB, T LSB, CRC-8 poly 0x31 init 0xFF). T = -45 + 175 * S / 65535 degC (datasheet eq. 1).
# Commands: 0xFD high (max 8.3 ms), 0xF6 medium (max 4.5 ms), 0xE0 low (max 1.6 ms) repeatability,
# 0x89 serial number, 0x94 soft reset (max 1 ms).
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


_MODES = {'high': (0xFD, 10), 'medium': (0xF6, 5), 'low': (0xE0, 2)}


class STS40:
    def __init__(self, i2c, addr=0x44):
        # STS40-AD1B answers at 0x44 (BD1B: 0x45, CD1B: 0x46). The address is fixed in the chip.
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time tPU is at most 1 ms

    def reset(self):
        """Soft reset (0x94); the sensor is idle again after at most 1 ms."""
        self.i2c.writeto(self.addr, b'\x94')
        time.sleep_ms(1)

    def serial_number(self):
        self.i2c.writeto(self.addr, b'\x89')
        time.sleep_ms(1)
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('STS40 CRC mismatch: check the wiring')
        return (d[0] << 24) | (d[1] << 16) | (d[3] << 8) | d[4]

    def read_raw(self, mode='high'):
        cmd, wait_ms = _MODES[mode]
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)
        d = self.i2c.readfrom(self.addr, 3)
        if _crc8(d[0:2]) != d[2]:
            raise OSError('STS40 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def temperature(self, mode='high'):
        """Measure once and return the temperature in degrees C."""
        return -45 + 175 * self.read_raw(mode) / 65535
