# AHT20 temperature & humidity sensor (Aosong / ASAIR AHT20), MicroPython driver.
# Follows the datasheet sequence: power-on wait, status check (bit 3 = calibrated, else send
# 0xBE 0x08 0x00), trigger 0xAC 0x33 0x00, wait 80 ms, poll busy (bit 7), read 7 bytes and
# check the CRC-8 (poly 0x31, init 0xFF) over status + 5 data bytes.
import time

_CMD_INIT = b'\xbe\x08\x00'
_CMD_MEASURE = b'\xac\x33\x00'
_BUSY = 0x80
_CALIBRATED = 0x08


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class AHT20:
    def __init__(self, i2c, addr=0x38):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(100)  # datasheet: wait after power-on before the first command
        if not self.status() & _CALIBRATED:
            self.i2c.writeto(self.addr, _CMD_INIT)
            time.sleep_ms(10)
            if not self.status() & _CALIBRATED:
                raise OSError('AHT20 not calibrated: check the wiring')

    def status(self):
        """The status byte: a plain one-byte read (bit 7 busy, bit 3 calibrated)."""
        return self.i2c.readfrom(self.addr, 1)[0]

    def read(self):
        """Measure once and return (temperature in °C, relative humidity in %)."""
        self.i2c.writeto(self.addr, _CMD_MEASURE)
        time.sleep_ms(80)  # datasheet: wait 80 ms for the measurement
        for _ in range(10):
            if not self.status() & _BUSY:
                break
            time.sleep_ms(10)
        else:
            raise OSError('AHT20 stayed busy')
        d = self.i2c.readfrom(self.addr, 7)
        if d[0] & _BUSY:
            raise OSError('AHT20 busy')
        if _crc8(d[0:6]) != d[6]:
            raise OSError('AHT20 CRC mismatch: check the wiring')
        h_raw = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4)
        t_raw = ((d[3] & 0x0F) << 16) | (d[4] << 8) | d[5]
        return t_raw * 200 / 1048576 - 50, h_raw * 100 / 1048576

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
