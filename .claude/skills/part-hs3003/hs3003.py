# HS3003 humidity & temperature sensor (Renesas HS300x series), MicroPython driver.
# Protocol from the Renesas HS300x datasheet (section 6):
#  - Measurement Request (MR): the 7-bit address with the WRITE bit and NO data bytes (zero-length write).
#  - Wait for the conversion: 33.90 ms for 14-bit RH + 14-bit T (factory default), including wake-up.
#  - Data Fetch (DF): read 4 bytes. Byte 0 bits 7:6 = status (00 valid, 01 stale), then humidity[13:0]
#    big-endian; bytes 2-3 = temperature[15:2] big-endian, the 2 LSBs of byte 3 are undefined (masked off).
#  - RH = H / (2^14 - 1) * 100 %RH;  T = T / (2^14 - 1) * 165 - 40 degC.
# No CRC: the status bits are the only validity check.
import time

ADDR = 0x44            # fixed address (datasheet 6.2)
_MEAS_MS = 34          # 33.90 ms at 14-bit / 14-bit resolution
_STATUS_STALE = 0x01


class HS3003:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def _request(self):
        # Measurement Request: address + W, then STOP (no command byte).
        self.i2c.writeto(self.addr, b'')

    def _fetch(self):
        d = self.i2c.readfrom(self.addr, 4)
        status = d[0] >> 6
        h_raw = ((d[0] & 0x3F) << 8) | d[1]
        t_raw = ((d[2] << 8) | d[3]) >> 2
        return status, h_raw, t_raw

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self._request()
        time.sleep_ms(_MEAS_MS + 6)  # margin over the 33.9 ms measurement time
        for _ in range(5):
            status, h_raw, t_raw = self._fetch()
            if status != _STATUS_STALE:
                break
            time.sleep_ms(10)  # conversion not finished yet: fetch again
        else:
            raise OSError('HS3003 returned stale data: check the wiring and the supply')
        rh = h_raw * 100 / 16383
        t = t_raw * 165 / 16383 - 40
        return t, rh

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
