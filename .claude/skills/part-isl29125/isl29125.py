# ISL29125 RGB colour light sensor (Renesas/Intersil ISL29125), MicroPython driver.
# Written from datasheet FN8424.2: I2C address 0x44 (fixed), device ID 0x7D in register 0x00,
# writing 0x46 to register 0x00 resets all registers. Data registers are little-endian 16-bit:
# green 0x09/0x0A, red 0x0B/0x0C, blue 0x0D/0x0E. In 16-bit mode each colour takes ~101 ms,
# so a full green/red/blue cycle takes about 303 ms.
import time

_ID = 0x00
_CONFIG1 = 0x01
_CONFIG2 = 0x02
_CONFIG3 = 0x03
_STATUS = 0x08
_GREEN_L = 0x09

MODE_RGB = 0x05      # CONFIG1 B2:B0 = 101: green/red/blue, continuous
RANGE_375 = 0x00     # CONFIG1 B3 = 0: 375 lux full scale
RANGE_10K = 0x08     # CONFIG1 B3 = 1: 10,000 lux full scale
BITS_16 = 0x00       # CONFIG1 B4 = 0: 16-bit ADC (~101 ms per colour)
BITS_12 = 0x10       # CONFIG1 B4 = 1: 12-bit ADC


class ISL29125:
    def __init__(self, i2c, addr=0x44, bright=True, ir_comp=0xBF):
        """bright=True selects the 10,000 lux range (False = 375 lux, for dim light).
        ir_comp goes to CONFIG2; the datasheet recommends 0xBF (maximum IR compensation)."""
        self.i2c = i2c
        self.addr = addr
        dev_id = self._r8(_ID)
        if dev_id != 0x7D:
            raise OSError('ISL29125 not found (ID 0x%02X, expected 0x7D): check the wiring' % dev_id)
        self._w8(_ID, 0x46)  # software reset: all registers back to defaults
        time.sleep_ms(1)
        cfg1 = MODE_RGB | (RANGE_10K if bright else RANGE_375) | BITS_16
        self._w8(_CONFIG1, cfg1)
        self._w8(_CONFIG2, ir_comp)
        self._w8(_CONFIG3, 0x00)  # no interrupts
        if self._r8(_CONFIG1) != cfg1 or self._r8(_CONFIG2) != ir_comp:
            raise OSError('ISL29125 configuration did not stick: check the wiring')
        time.sleep_ms(350)  # first full G/R/B conversion cycle (3 x 101 ms)

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def rgb(self):
        """Return the latest (red, green, blue) ADC counts, 0-65535 each."""
        d = self.i2c.readfrom_mem(self.addr, _GREEN_L, 6)
        g = d[0] | (d[1] << 8)
        r = d[2] | (d[3] << 8)
        b = d[4] | (d[5] << 8)
        return r, g, b

    def red(self):
        return self.rgb()[0]

    def green(self):
        return self.rgb()[1]

    def blue(self):
        return self.rgb()[2]
