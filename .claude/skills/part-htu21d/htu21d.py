# HTU21D(F) temperature & humidity sensor (TE / MEAS), MicroPython driver.
# Uses the "No Hold Master" commands (0xF3 temperature, 0xF5 humidity) at the default
# 14-bit T / 12-bit RH resolution, and checks the CRC-8 (poly 0x31, init 0x00) from the datasheet.
import time

_ADDR = 0x40
_TRIG_T_NOHOLD = 0xF3
_TRIG_RH_NOHOLD = 0xF5
_SOFT_RESET = 0xFE


def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class HTU21D:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(15)  # power-up: up to 15 ms before the first command
        self.i2c.writeto(self.addr, bytes([_SOFT_RESET]))
        time.sleep_ms(15)  # soft reset takes less than 15 ms

    def _measure(self, cmd, wait_ms, is_rh):
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)  # datasheet maximum conversion time
        d = None
        for _ in range(5):  # the chip NACKs its address until the conversion is done
            try:
                d = self.i2c.readfrom(self.addr, 3)
                break
            except OSError:
                time.sleep_ms(5)
        if d is None:
            raise OSError('HTU21D not responding: check the wiring')
        if _crc8(d[0:2]) != d[2]:
            raise OSError('HTU21D CRC mismatch: check the wiring')
        raw = (d[0] << 8) | d[1]
        if bool(raw & 0x02) != is_rh:
            raise OSError('HTU21D returned the wrong measurement type')
        return raw & 0xFFFC  # clear the two status bits before converting

    def temperature(self):
        """Temperature in °C: -46.85 + 175.72 * S / 2^16."""
        return -46.85 + 175.72 * self._measure(_TRIG_T_NOHOLD, 50, False) / 65536

    def humidity(self):
        """Relative humidity in %: -6 + 125 * S / 2^16 (not temperature-compensated)."""
        return -6 + 125 * self._measure(_TRIG_RH_NOHOLD, 16, True) / 65536

    def read(self):
        """Return (temperature in °C, relative humidity in %)."""
        return self.temperature(), self.humidity()
