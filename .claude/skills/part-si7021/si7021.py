# Si7021-A20 temperature & humidity sensor (Silicon Labs), MicroPython driver.
# Uses the "No Hold Master" commands (0xF5 humidity, 0xF3 temperature) at the default
# 12-bit RH / 14-bit T resolution, reads the temperature measured during the RH
# conversion with 0xE0, and checks the CRC-8 (x^8+x^5+x^4+1 = 0x31, init 0x00).
import time

_ADDR = 0x40
_MEAS_RH_NOHOLD = 0xF5
_MEAS_T_NOHOLD = 0xF3
_READ_PREV_T = 0xE0
_RESET = 0xFE


def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _t_from_code(code):
    return 175.72 * code / 65536 - 46.85


class SI7021:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(80)  # power-up: up to 80 ms over the full temperature range
        self.i2c.writeto(self.addr, bytes([_RESET]))
        time.sleep_ms(15)  # reset takes up to 15 ms

    def _measure(self, cmd, wait_ms):
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)  # datasheet maximum conversion time
        d = None
        for _ in range(10):  # the chip NACKs its address until the conversion is done
            try:
                d = self.i2c.readfrom(self.addr, 3)
                break
            except OSError:
                time.sleep_ms(5)
        if d is None:
            raise OSError('Si7021 not responding: check the wiring')
        if _crc8(d[0:2]) != d[2]:
            raise OSError('Si7021 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def humidity(self):
        """Relative humidity in %: 125 * RH_Code / 65536 - 6, limited to 0..100."""
        # 12-bit RH (12 ms) plus the 14-bit temperature it also measures (10.8 ms)
        rh = 125 * self._measure(_MEAS_RH_NOHOLD, 25) / 65536 - 6
        return min(100.0, max(0.0, rh))

    def temperature(self):
        """Temperature in °C: 175.72 * Temp_Code / 65536 - 46.85."""
        return _t_from_code(self._measure(_MEAS_T_NOHOLD, 11))

    def read(self):
        """Measure humidity, then fetch the temperature taken during that measurement (0xE0).
        Returns (temperature in °C, relative humidity in %)."""
        h = self.humidity()
        self.i2c.writeto(self.addr, bytes([_READ_PREV_T]))
        d = self.i2c.readfrom(self.addr, 2)  # 0xE0 returns no checksum
        return _t_from_code((d[0] << 8) | d[1]), h
