# AHT30 temperature & humidity sensor (Aosong / ASAIR), MicroPython driver.
# Follows the AHT30 datasheet, section 5.2 (sensor reading process):
#  1. after VDD comes up wait >= 5 ms, then send the measure command 0xAC 0x33 0x00
#     (0x70 is the address byte for a write to 0x38);
#  2. wait 80 ms, then read 7 bytes (0x71 = read from 0x38): Status, S_RH[19:0],
#     S_T[19:0], CRC. Status bit 7 = 1 means still busy (the data would be the
#     previous measurement), so poll until it clears;
#  3. CRC-8 over Status + the 5 data bytes: polynomial 0x31 (1+x^4+x^5+x^8), init 0xFF;
#  4. RH = S_RH / 2^20 * 100 %, T = S_T / 2^20 * 200 - 50 degC.
# Unlike the AHT10/AHT20/AHT21, the AHT30 needs no calibration / register
# initialisation command: the datasheet goes straight from power-on to measuring.
import time

_ADDR = 0x38
_CMD_MEASURE = b'\xac\x33\x00'
_BUSY = 0x80


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class AHT30:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(5)  # datasheet: wait >= 5 ms after VDD power-on before communicating
        if self.addr not in i2c.scan():
            raise OSError('AHT30 not found at 0x%02x: check the wiring' % self.addr)

    def status(self):
        """The status byte (a plain one-byte read): bit 7 busy, bit 4 OTP CRC ok, bit 3 calibration on."""
        return self.i2c.readfrom(self.addr, 1)[0]

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self.i2c.writeto(self.addr, _CMD_MEASURE)
        time.sleep_ms(80)  # datasheet: wait 80 ms for the measurement to finish
        for _ in range(10):
            d = self.i2c.readfrom(self.addr, 7)
            if not d[0] & _BUSY:
                break
            time.sleep_ms(10)
        else:
            raise OSError('AHT30 stayed busy')
        if _crc8(d[0:6]) != d[6]:
            raise OSError('AHT30 CRC mismatch: check the wiring')
        h_raw = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4)
        t_raw = ((d[3] & 0x0F) << 16) | (d[4] << 8) | d[5]
        return t_raw * 200 / 1048576 - 50, h_raw * 100 / 1048576

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
