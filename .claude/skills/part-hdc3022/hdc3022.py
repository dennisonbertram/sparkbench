# HDC3022 temperature & humidity sensor (Texas Instruments HDC302x), MicroPython driver.
# Trigger-on-demand measurement in low power mode 0 (command 0x2400, 12.5 ms typical),
# every data word CRC-8 checked as in the datasheet (CRC-8/NRSC-5: poly 0x31, init 0xFF).
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class HDC3022:
    def __init__(self, i2c, addr=0x44):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(5)  # power-up ready: 5 ms max
        if self.manufacturer_id() != 0x3000:
            raise OSError('HDC3022 not found: manufacturer ID is not 0x3000')

    def _word(self, d):
        if _crc8(d[0:2]) != d[2]:
            raise OSError('HDC3022 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def manufacturer_id(self):
        """Texas Instruments ID, 0x3000 (command 0x3781)."""
        self.i2c.writeto(self.addr, b'\x37\x81')
        return self._word(self.i2c.readfrom(self.addr, 3))

    def reset(self):
        """Soft reset (command 0x30A2); the sensor is ready again within 3 ms."""
        self.i2c.writeto(self.addr, b'\x30\xa2')
        time.sleep_ms(3)

    def read(self):
        """Measure once and return (temperature in °C, relative humidity in %)."""
        self.i2c.writeto(self.addr, b'\x24\x00')
        time.sleep_ms(15)  # LPM0 conversion: 12.5 ms typical (T + RH)
        d = self.i2c.readfrom(self.addr, 6)  # T MSB, T LSB, CRC, RH MSB, RH LSB, CRC
        t_raw = self._word(d[0:3])
        h_raw = self._word(d[3:6])
        return -45 + 175 * t_raw / 65535, 100 * h_raw / 65535

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
