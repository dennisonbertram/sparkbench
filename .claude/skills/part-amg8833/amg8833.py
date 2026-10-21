# AMG8833 8x8 infrared array ("Grid-EYE", Panasonic), MicroPython driver.
# Register map from the Panasonic Grid-EYE specification:
#   0x00 PCTL (0x00 = normal mode), 0x01 RST (0x3F = initial reset),
#   0x02 FPSC (0 = 10 fps, 1 = 1 fps), 0x03 INTC (0 = INT pin off),
#   0x0E/0x0F thermistor: 12 bits, sign + absolute value, 0.0625 C per LSB,
#   0x80..0xFF pixels 1..64: low byte then high byte, 12-bit two's complement,
#   0.25 C per LSB. All 128 pixel bytes are read in one transfer so a frame is never mixed.
import time

_PCTL = 0x00
_RST = 0x01
_FPSC = 0x02
_INTC = 0x03
_TTHL = 0x0E
_T01L = 0x80


class AMG8833:
    def __init__(self, i2c, addr=0x69):
        """addr 0x69 = AD_SELECT high (Adafruit default); 0x68 with the Addr jumper soldered."""
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(50)  # setup time after power-up before I2C works
        self._w(_PCTL, 0x00)  # normal mode
        self._w(_RST, 0x3F)  # initial reset: back to default settings
        self._w(_INTC, 0x00)  # interrupt output off
        self._w(_FPSC, 0x00)  # 10 frames per second
        time.sleep_ms(100)  # let the first frame complete

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def thermistor(self):
        """On-chip thermistor (board) temperature in C, 0.0625 C resolution."""
        d = self.i2c.readfrom_mem(self.addr, _TTHL, 2)
        raw = ((d[1] << 8) | d[0]) & 0x0FFF
        if raw & 0x800:  # sign + magnitude, not two's complement
            return -(raw & 0x7FF) * 0.0625
        return raw * 0.0625

    def pixels(self):
        """List of 64 pixel temperatures in C (row by row, pixel 1 first), 0.25 C resolution."""
        d = self.i2c.readfrom_mem(self.addr, _T01L, 128)
        out = []
        for i in range(64):
            raw = ((d[2 * i + 1] << 8) | d[2 * i]) & 0x0FFF
            if raw & 0x800:  # 12-bit two's complement
                raw -= 0x1000
            out.append(raw * 0.25)
        return out

    def grid(self):
        """The 64 pixels as 8 rows of 8."""
        p = self.pixels()
        return [p[r * 8:(r + 1) * 8] for r in range(8)]
