# DHT20 temperature & humidity sensor (Aosong / ASAIR DHT20, AHT20 inside), MicroPython driver.
# Follows the DHT20 datasheet (V1.0, section 7.4): wait >= 100 ms after power-on, read the
# status byte; if (status & 0x18) != 0x18 run Aosong's register initialisation (0x1B, 0x1C,
# 0x1E); wait 10 ms; trigger 0xAC 0x33 0x00; wait 80 ms; poll busy (bit 7); read status +
# 5 data bytes + CRC-8 (poly 0x31 = x^8+x^5+x^4+1, init 0xFF).
import time

_ADDR = 0x38
_CMD_MEASURE = b'\xac\x33\x00'
_BUSY = 0x80
_READY_MASK = 0x18


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class DHT20:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(100)  # datasheet 7.1/7.4: >= 100 ms after power-on
        if self.status() & _READY_MASK != _READY_MASK:
            for reg in (0x1B, 0x1C, 0x1E):
                self._reset_reg(reg)
            time.sleep_ms(10)
            if self.status() & _READY_MASK != _READY_MASK:
                raise OSError('DHT20 not ready: check the wiring')
        time.sleep_ms(10)  # datasheet 7.4 step 2: wait 10 ms before the first trigger

    def _reset_reg(self, reg):
        # Aosong's reference initialisation routine for registers 0x1B/0x1C/0x1E.
        self.i2c.writeto(self.addr, bytes((reg, 0x00, 0x00)))
        time.sleep_ms(5)
        d = self.i2c.readfrom(self.addr, 3)
        time.sleep_ms(10)
        self.i2c.writeto(self.addr, bytes((0xB0 | reg, d[1], d[2])))
        time.sleep_ms(10)

    def status(self):
        """The status byte (a plain one-byte read): bit 7 busy, bit 3 calibrated."""
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
            raise OSError('DHT20 stayed busy')
        d = self.i2c.readfrom(self.addr, 7)
        if d[0] & _BUSY:
            raise OSError('DHT20 busy')
        if _crc8(d[0:6]) != d[6]:
            raise OSError('DHT20 CRC mismatch: check the wiring')
        h_raw = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4)
        t_raw = ((d[3] & 0x0F) << 16) | (d[4] << 8) | d[5]
        return t_raw * 200 / 1048576 - 50, h_raw * 100 / 1048576

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
