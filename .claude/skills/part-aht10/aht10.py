# AHT10 temperature & humidity sensor (Aosong/ASAIR AHT10), MicroPython driver.
# Written from the ASAIR AHT10 technical manual: address 0x38, init 0xE1 0x08 0x00,
# trigger 0xAC 0x33 0x00, wait > 75 ms, read 6 bytes (status + 20-bit RH + 20-bit T).
# The AHT10 sends no CRC byte (unlike the AHT20).
import time

_ADDR = 0x38
_CMD_INIT = b'\xe1\x08\x00'
_CMD_MEASURE = b'\xac\x33\x00'
_CMD_RESET = b'\xba'
_BUSY = 0x80
_CALIBRATED = 0x08


class AHT10:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(40)  # datasheet: up to 20 ms after power-on to reach idle
        self.i2c.writeto(self.addr, _CMD_INIT)
        time.sleep_ms(350)
        if not self.status() & _CALIBRATED:
            raise OSError('AHT10 not calibrated: check the wiring')

    def reset(self):
        """Soft reset (0xBA); the sensor needs under 20 ms to restart."""
        self.i2c.writeto(self.addr, _CMD_RESET)
        time.sleep_ms(20)

    def status(self):
        """The status byte: a plain one-byte read (bit 7 busy, bit 3 calibration enabled)."""
        return self.i2c.readfrom(self.addr, 1)[0]

    def read(self):
        """Measure once and return (temperature in °C, relative humidity in %)."""
        self.i2c.writeto(self.addr, _CMD_MEASURE)
        time.sleep_ms(80)  # datasheet: wait more than 75 ms
        for _ in range(10):
            d = self.i2c.readfrom(self.addr, 6)
            if not d[0] & _BUSY:
                break
            time.sleep_ms(10)
        else:
            raise OSError('AHT10 stayed busy')
        h_raw = (d[1] << 12) | (d[2] << 4) | (d[3] >> 4)
        t_raw = ((d[3] & 0x0F) << 16) | (d[4] << 8) | d[5]
        return t_raw * 200 / 1048576 - 50, h_raw * 100 / 1048576

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
