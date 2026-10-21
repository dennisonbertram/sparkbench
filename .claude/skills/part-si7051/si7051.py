# Si7051 +/-0.1 degC digital temperature sensor (Silicon Labs Si7050/1/3/4/5-A20), MicroPython driver.
# Uses "Measure Temperature, No Hold Master Mode" (0xF3) at the default 14-bit resolution and
# checks the CRC-8 checksum (x^8 + x^5 + x^4 + 1 = 0x31, initial value 0x00) from the datasheet.
import time

_ADDR = 0x40
_MEAS_T_NOHOLD = 0xF3
_RESET = 0xFE
_READ_USER_REG = 0xE7
_WRITE_USER_REG = 0xE6

# User Register 1 RES[1:0] = bits D7, D0 -> (bit pattern, max conversion time in ms)
_RES = {14: (0x00, 11), 13: (0x80, 7), 12: (0x01, 4), 11: (0x81, 3)}


def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class SI7051:
    def __init__(self, i2c, addr=_ADDR):
        self.i2c = i2c
        self.addr = addr
        self._conv_ms = 11  # 14-bit conversion: 10.8 ms max
        time.sleep_ms(80)  # power-up: up to 80 ms over the full temperature range
        self.i2c.writeto(self.addr, bytes([_RESET]))
        time.sleep_ms(15)  # soft reset: up to 15 ms

    def set_resolution(self, bits):
        """11, 12, 13 or 14 bits (default 14). Reserved bits are written back unchanged."""
        pattern, ms = _RES[bits]
        self.i2c.writeto(self.addr, bytes([_READ_USER_REG]))
        reg = self.i2c.readfrom(self.addr, 1)[0]
        reg = (reg & 0x7E) | pattern
        self.i2c.writeto(self.addr, bytes([_WRITE_USER_REG, reg]))
        self._conv_ms = ms

    def raw(self):
        """Start a conversion and return the 16-bit Temp_Code (CRC checked)."""
        self.i2c.writeto(self.addr, bytes([_MEAS_T_NOHOLD]))
        time.sleep_ms(self._conv_ms)
        d = None
        for _ in range(10):  # the chip NACKs its address until the conversion is complete
            try:
                d = self.i2c.readfrom(self.addr, 3)  # MSB, LSB, checksum
                break
            except OSError:
                time.sleep_ms(2)
        if d is None:
            raise OSError('Si7051 not responding: check the wiring')
        if _crc8(d[0:2]) != d[2]:
            raise OSError('Si7051 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def temperature(self):
        """Temperature in degC: 175.72 * Temp_Code / 65536 - 46.85."""
        return 175.72 * self.raw() / 65536 - 46.85
