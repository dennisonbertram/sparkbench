# AGS02MA TVOC gas sensor (Aosong/ASAIR AGS02MA, datasheet June 2022), MicroPython driver.
# I2C address 0x1A. The bus MUST run at 30 kHz or slower (use freq=20000), and SDA/SCL need
# 1-10 kOhm pull-ups to VDD. Every reply is 4 data bytes + CRC-8 (poly 0x31, init 0xFF).
# Preheat at least 120 s after power-up; read TVOC no more often than every 1.5 s (2 s period).
import time

_REG_TVOC = 0x00
_REG_CAL = 0x01
_REG_VERSION = 0x11
_REG_RESISTANCE = 0x20
_REG_ADDR = 0x21


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class AGS02MA:
    def __init__(self, i2c, addr=0x1A):
        self.i2c = i2c
        self.addr = addr
        self.ready = False

    def _read(self, reg):
        # Write the register, wait 30 ms (datasheet note 1), then read Data1..Data4 + CRC.
        self.i2c.writeto(self.addr, bytes([reg]))
        time.sleep_ms(30)
        d = self.i2c.readfrom(self.addr, 5)
        if _crc8(d[0:4]) != d[4]:
            raise OSError('AGS02MA CRC mismatch: check wiring, pull-ups and I2C speed (<= 30 kHz)')
        return d

    def _write(self, reg, data4):
        buf = bytes([reg]) + bytes(data4) + bytes([_crc8(data4)])
        self.i2c.writeto(self.addr, buf)
        time.sleep_ms(30)

    def tvoc(self):
        """TVOC in ppb (24-bit, 0-99999). Sets self.ready from the status RDY bit (0 = ready);
        returns None while the sensor is still preheating / data not ready."""
        d = self._read(_REG_TVOC)
        self.ready = (d[0] & 0x01) == 0
        if not self.ready:
            return None
        return (d[1] << 16) | (d[2] << 8) | d[3]

    def resistance_kohm(self):
        """Sensing-element resistance in kOhm (32-bit raw, unit 0.1 kOhm)."""
        d = self._read(_REG_RESISTANCE)
        return ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) / 10

    def version(self):
        """Firmware version (Data4 of register 0x11)."""
        return self._read(_REG_VERSION)[3]

    def zero_calibrate(self):
        """Zero-point calibration in fresh air after >= 5 min powered. Lost at power-off."""
        self._write(_REG_CAL, (0x00, 0x0C, 0xFF, 0xF3))

    def set_address(self, new_addr):
        """Change the I2C address (1-127). Saved permanently, takes effect at once."""
        new_addr &= 0x7F
        inv = (~new_addr) & 0xFF
        self._write(_REG_ADDR, (new_addr, inv, new_addr, inv))
        self.addr = new_addr
