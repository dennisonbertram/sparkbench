# HDC1080 temperature & humidity sensor (Texas Instruments), MicroPython driver.
# Written from the TI datasheet (SNAS672A): sequential mode (config bit 12 = 1), 14-bit T and RH.
# Trigger = pointer write to 0x00; after the conversion the chip returns T then RH in one 4-byte read.
import time

_ADDR = 0x40
_REG_TEMP = 0x00
_REG_CONFIG = 0x02
_REG_MFR_ID = 0xFE
_REG_DEV_ID = 0xFF
_CONFIG = 0x1000  # heater off, MODE=1 (T then RH), TRES=14 bit, HRES=14 bit


class HDC1080:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(15)  # start-up time: up to 15 ms after power-up
        if self._read_reg(_REG_MFR_ID) != 0x5449 or self._read_reg(_REG_DEV_ID) != 0x1050:
            raise OSError('HDC1080 not found at 0x%02x: check the wiring' % addr)
        self.i2c.writeto(self.addr, bytes([_REG_CONFIG, _CONFIG >> 8, _CONFIG & 0xFF]))
        time.sleep_ms(1)

    def _read_reg(self, reg):
        self.i2c.writeto(self.addr, bytes([reg]))
        d = self.i2c.readfrom(self.addr, 2)
        return (d[0] << 8) | d[1]

    def read(self):
        """Measure once and return (temperature in °C, relative humidity in %)."""
        self.i2c.writeto(self.addr, bytes([_REG_TEMP]))  # pointer write to 0x00 starts T + RH
        time.sleep_ms(20)  # 6.35 ms (T, 14 bit) + 6.50 ms (RH, 14 bit), with margin
        d = None
        for _ in range(5):  # the chip NACKs the read until the conversion is done
            try:
                d = self.i2c.readfrom(self.addr, 4)
                break
            except OSError:
                time.sleep_ms(5)
        if d is None:
            raise OSError('HDC1080 not responding: check the wiring')
        t_raw = (d[0] << 8) | d[1]
        h_raw = (d[2] << 8) | d[3]
        # Datasheet: T = raw / 2^16 * 165 - 40 °C, RH = raw / 2^16 * 100 %
        return t_raw * 165 / 65536 - 40, h_raw * 100 / 65536

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
