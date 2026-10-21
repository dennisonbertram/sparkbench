# Adafruit STEMMA Soil Sensor (#4026), MicroPython driver.
# The board's ATSAMD10 runs Adafruit's seesaw firmware: every access is an I2C write of
# [module base, function] (plus data for writes), a short pause, then a separate I2C read.
#   Status base 0x00: HW_ID 0x01 (1 byte, 0x55 on SAMD09/10 seesaw), TEMP 0x04 (4 bytes,
#   signed 32-bit, 16.16 fixed point degrees C), SWRST 0x7F (write 0xFF to reset).
#   Touch base 0x0F: channel 0 at function 0x10 (2 bytes, big-endian capacitance count;
#   about 200 = very dry to 2000 = very wet; values above 4095 are invalid reads).
import time

_STATUS_BASE = 0x00
_STATUS_HW_ID = 0x01
_STATUS_TEMP = 0x04
_STATUS_SWRST = 0x7F
_TOUCH_BASE = 0x0F
_TOUCH_CHANNEL_OFFSET = 0x10
_HW_ID_SAMD09 = 0x55


class StemmaSoil:
    def __init__(self, i2c, addr=0x36, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            self.i2c.writeto(self.addr, bytes([_STATUS_BASE, _STATUS_SWRST, 0xFF]))
            time.sleep_ms(500)  # seesaw needs time to reboot after a software reset
        hw = self._read(_STATUS_BASE, _STATUS_HW_ID, 1)[0]
        if hw != _HW_ID_SAMD09:
            raise OSError('seesaw HW_ID 0x%02x, expected 0x55: check the wiring' % hw)

    def _read(self, base, func, n, delay_ms=5):
        # Separate write and read transactions (no repeated start), with the pause seesaw needs.
        self.i2c.writeto(self.addr, bytes([base, func]))
        time.sleep_ms(delay_ms)
        return self.i2c.readfrom(self.addr, n)

    def moisture(self):
        """Capacitive moisture count, ~200 (dry) to ~2000 (wet)."""
        for _ in range(5):
            b = self._read(_TOUCH_BASE, _TOUCH_CHANNEL_OFFSET, 2)
            v = (b[0] << 8) | b[1]
            if v <= 4095:
                return v
            time.sleep_ms(1)
        raise OSError('no valid moisture reading')

    def temperature(self):
        """Chip temperature in degrees C (about +/-2 C)."""
        b = self._read(_STATUS_BASE, _STATUS_TEMP, 4)
        raw = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
        if raw & 0x80000000:
            raw -= 1 << 32
        return raw / 65536
