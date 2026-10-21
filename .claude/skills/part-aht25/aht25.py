# AHT25 temperature & humidity sensor (Aosong / ASAIR), MicroPython driver.
# Follows the AHT25 datasheet V1.0 reading process (section 7.4):
#  1. wait >= 100 ms after power-on, read one status byte (address byte 0x71 = 0x38 read);
#     if (status & 0x18) != 0x18, initialise registers 0x1B, 0x1C and 0x1E with Aosong's routine;
#  2. wait 10 ms, send 0xAC 0x33 0x00 (trigger measurement);
#  3. wait 80 ms, poll status bit 7 (busy) until clear, then read status + 6 data bytes + CRC;
#  4. check the CRC-8 (poly 1+x^4+x^5+x^8 = 0x31, init 0xFF) over the first 6 bytes;
#  5. RH = S_RH / 2^20 * 100 %, T = S_T / 2^20 * 200 - 50 degC (section 8).
import time

_ADDR = 0x38
_CMD_MEASURE = b'\xac\x33\x00'
_BUSY = 0x80
_READY = 0x18  # bit 4 and bit 3 (CAL enable) must both be set


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class AHT25:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(100)  # datasheet 7.1/7.4: >= 100 ms after power-on
        if (self.status() & _READY) != _READY:
            for reg in (0x1B, 0x1C, 0x1E):
                self._reset_reg(reg)
            if (self.status() & _READY) != _READY:
                raise OSError('AHT25 not ready (status 0x%02x): check the wiring' % self.status())
        time.sleep_ms(10)  # datasheet 7.4 step 2: wait 10 ms before triggering

    def _reset_reg(self, reg):
        # Aosong's published initialisation routine for registers 0x1B/0x1C/0x1E.
        self.i2c.writeto(self.addr, bytes((reg, 0x00, 0x00)))
        time.sleep_ms(5)
        r = self.i2c.readfrom(self.addr, 3)
        time.sleep_ms(10)
        self.i2c.writeto(self.addr, bytes((0xB0 | reg, r[1], r[2])))

    def status(self):
        """The status byte: a plain one-byte read (bit 7 busy, bit 3 calibrated)."""
        return self.i2c.readfrom(self.addr, 1)[0]

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self.i2c.writeto(self.addr, _CMD_MEASURE)
        time.sleep_ms(80)  # datasheet: wait 80 ms for the measurement
        for _ in range(10):
            if not self.status() & _BUSY:
                break
            time.sleep_ms(10)
        else:
            raise OSError('AHT25 stayed busy')
        d = self.i2c.readfrom(self.addr, 7)
        if d[0] & _BUSY:
            raise OSError('AHT25 busy')
        if _crc8(d[0:6]) != d[6]:
            raise OSError('AHT25 CRC mismatch: check the wiring')
        h_raw = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4)
        t_raw = ((d[3] & 0x0F) << 16) | (d[4] << 8) | d[5]
        return t_raw * 200 / 1048576 - 50, h_raw * 100 / 1048576

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
