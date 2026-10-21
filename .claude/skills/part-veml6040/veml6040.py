# VEML6040 RGBW colour sensor (Vishay, datasheet doc 84276 + app note 84331), MicroPython driver.
# I2C address 0x10 (fixed). 16-bit registers ("command codes"), sent and received LSB first:
#   write: [command code, data LSB, data MSB]; read: command code, repeated start, LSB, MSB.
# 0x00 CONF (low byte: IT2..IT0 in bits 6:4, TRIG bit 2, AF bit 1, SD bit 0; high byte reserved = 0)
# 0x08 R, 0x09 G, 0x0A B, 0x0B W result counts (0..65535).
# Lux = G counts x G sensitivity for the integration time (datasheet table 6).
import time

_CONF = 0x00
_R = 0x08
_G = 0x09
_B = 0x0A
_W = 0x0B

_SD = 0x01    # 1 = colour sensor shut down
_AF = 0x02    # 1 = active force (single measurement) mode, 0 = auto mode
_TRIG = 0x04  # 1 = start one measurement in force mode

# integration time in ms -> (IT bits, G sensitivity in lx/count), datasheet table 6
_IT = {
    40: (0b000, 0.25168),
    80: (0b001, 0.12584),
    160: (0b010, 0.06292),
    320: (0b011, 0.03146),
    640: (0b100, 0.01573),
    1280: (0b101, 0.007865),
}


class VEML6040:
    def __init__(self, i2c, addr=0x10, it_ms=160, force=False):
        self.i2c = i2c
        self.addr = addr
        self.configure(it_ms, force)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)  # repeated start, as the datasheet requires
        return d[0] | (d[1] << 8)  # LSB first

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def configure(self, it_ms=160, force=False):
        """Integration time 40/80/160/320/640/1280 ms; force=True for single measurements on demand.

        Auto mode (default) measures continuously. Max lux before the G channel saturates:
        40 ms 16496, 80 ms 8248, 160 ms 4124, 320 ms 2062, 640 ms 1031, 1280 ms 515.4."""
        if it_ms not in _IT:
            raise ValueError('it_ms must be 40, 80, 160, 320, 640 or 1280')
        self.it_ms = it_ms
        self.force = force
        self.sensitivity = _IT[it_ms][1]
        self._conf = (_IT[it_ms][0] << 4) | (_AF if force else 0)
        self._write(_CONF, self._conf | _SD)  # shut down while changing settings (app note sequence)
        self._write(_CONF, self._conf)        # SD = 0: enable
        if not force:
            time.sleep_ms(it_ms + it_ms // 10 + 5)  # wait for the first complete integration

    def measure(self):
        """Force mode only: trigger one measurement and wait for it to finish."""
        self._write(_CONF, self._conf | _TRIG)
        time.sleep_ms(self.it_ms + self.it_ms // 10 + 5)

    def rgbw(self):
        """Raw (R, G, B, W) counts, 0..65535 each. In force mode call measure() first."""
        return self._read(_R), self._read(_G), self._read(_B), self._read(_W)

    def red(self):
        return self._read(_R)

    def green(self):
        return self._read(_G)

    def blue(self):
        return self._read(_B)

    def white(self):
        return self._read(_W)

    def lux(self, g=None):
        """Ambient light in lx: G counts x sensitivity for the integration time (app note 84331)."""
        if g is None:
            g = self._read(_G)
        return g * self.sensitivity

    @staticmethod
    def cct(r, g, b, offset=0.5):
        """Correlated colour temperature in K, app note empirical formula:
        CCT = 4278.6 x ((R - B) / G + offset) ^ -1.2455, offset 0.5 in open air.
        Returns None when it cannot be computed (no green light, or a very blue source)."""
        if g == 0:
            return None
        ccti = (r - b) / g + offset
        if ccti <= 0:
            return None
        return 4278.6 * ccti ** -1.2455

    def shutdown(self, off=True):
        """SD bit: off=True stops measuring (about 0.8 uA); the last results stay readable."""
        if off:
            self._write(_CONF, self._conf | _SD)
        else:
            self._write(_CONF, self._conf)
            if not self.force:
                time.sleep_ms(self.it_ms + self.it_ms // 10 + 5)
