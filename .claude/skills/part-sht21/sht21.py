# Sensirion SHT21 temperature & humidity sensor, MicroPython driver.
# Datasheet: Sensirion SHT21 datasheet, Version 5 (October 2022).
# Uses the "No Hold Master" commands (0xF3 temperature, 0xF5 humidity) at the default
# 14-bit T / 12-bit RH resolution and checks the CRC-8 (poly 0x31, init 0x00).
#
# Datasheet section 5.8: in No Hold mode the STOP after the command must come either
# < 15 us or > 18.5 us after the sensor's ACK. I2C.writeto() sends the STOP right after
# the ACK clock (about 5 us at 100 kHz, less at 400 kHz) and the next transfer only
# happens after the conversion wait, so keep the bus at 100 kHz or faster.
import time

_ADDR = 0x40
_TRIG_T_NOHOLD = 0xF3
_TRIG_RH_NOHOLD = 0xF5
_SOFT_RESET = 0xFE
_T_WAIT_MS = 85   # 14-bit temperature, datasheet Table 7 maximum
_RH_WAIT_MS = 29  # 12-bit humidity, datasheet Table 7 maximum


def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SHT21:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(15)  # power-up: at most 15 ms before the sensor is ready
        self.i2c.writeto(self.addr, bytes([_SOFT_RESET]))
        time.sleep_ms(15)  # soft reset takes less than 15 ms

    def _measure(self, cmd, wait_ms, is_rh):
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)
        d = None
        for _ in range(5):  # the sensor NACKs its read address until the conversion is done
            try:
                d = self.i2c.readfrom(self.addr, 3)
                break
            except OSError:
                time.sleep_ms(5)
        if d is None:
            raise OSError('SHT21 not responding: check the wiring')
        if _crc8(d[0:2]) != d[2]:
            raise OSError('SHT21 CRC mismatch: check the wiring')
        raw = (d[0] << 8) | d[1]
        if bool(raw & 0x02) != is_rh:  # status bit 1: 0 = temperature, 1 = humidity
            raise OSError('SHT21 returned the wrong measurement type')
        return raw & 0xFFFC  # status bits must be set to 0 before converting

    def temperature(self):
        """Temperature in degC: T = -46.85 + 175.72 * S / 2^16."""
        return -46.85 + 175.72 * self._measure(_TRIG_T_NOHOLD, _T_WAIT_MS, False) / 65536

    def humidity(self):
        """Relative humidity in % (above liquid water): RH = -6 + 125 * S / 2^16."""
        return -6 + 125 * self._measure(_TRIG_RH_NOHOLD, _RH_WAIT_MS, True) / 65536

    def read(self):
        """Return (temperature in degC, relative humidity in %)."""
        return self.temperature(), self.humidity()
