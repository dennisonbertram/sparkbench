# VEML7700 ambient light sensor (Vishay, datasheet doc 84286 + app note 84323), MicroPython driver.
# 16-bit registers ("command codes"), sent and received LSB first:
#   write: [command code, data LSB, data MSB]; read: command code, repeated start, LSB, MSB.
# Lux = ALS counts x resolution, resolution set by gain and integration time
# (0.0042 lx/count at gain x2 / 800 ms, doubling for each halving of either).
import time

_ALS_CONF = 0x00
_ALS_WH = 0x01
_ALS_WL = 0x02
_POWER_SAVING = 0x03
_ALS = 0x04
_WHITE = 0x05
_ALS_INT = 0x06
_ID = 0x07

# ALS_GAIN, bits 12:11 of ALS_CONF_0
GAIN_1 = 0b00
GAIN_2 = 0b01
GAIN_1_8 = 0b10
GAIN_1_4 = 0b11

# ALS_IT, bits 9:6 of ALS_CONF_0, keyed by integration time in ms
_IT_BITS = {25: 0b1100, 50: 0b1000, 100: 0b0000, 200: 0b0001, 400: 0b0010, 800: 0b0011}
# Resolution = 0.0042 lx/count x (800 / IT) x _GAIN_DIV[gain]  (app note resolution table)
_GAIN_DIV = {GAIN_2: 1, GAIN_1: 2, GAIN_1_4: 8, GAIN_1_8: 16}


class VEML7700:
    def __init__(self, i2c, addr=0x10, gain=GAIN_1_4, it_ms=100):
        self.i2c = i2c
        self.addr = addr
        ident = self._read(_ID)
        if ident & 0xFF != 0x81:  # low byte of the ID register is always 0x81
            raise OSError('VEML7700 not found at 0x%02X (ID 0x%04X)' % (addr, ident))
        self._write(_POWER_SAVING, 0x0000)  # PSM off: a new result every integration time
        self.configure(gain, it_ms)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)  # LSB first

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def configure(self, gain=GAIN_1_4, it_ms=100):
        """Set gain (GAIN_2, GAIN_1, GAIN_1_4, GAIN_1_8) and integration time (25..800 ms), power on.

        Start with GAIN_1_4 or GAIN_1_8 when the light level is unknown (app note): x1 and x2
        saturate and turn non-linear above about 100 lx."""
        if it_ms not in _IT_BITS or gain not in _GAIN_DIV:
            raise ValueError('it_ms must be 25, 50, 100, 200, 400 or 800 and gain a GAIN_ constant')
        self.gain = gain
        self.it_ms = it_ms
        self.resolution = 0.0042 * (800 / it_ms) * _GAIN_DIV[gain]
        # ALS_PERS = 1, ALS_INT_EN = 0, ALS_SD = 0 (power on)
        self._write(_ALS_CONF, (gain << 11) | (_IT_BITS[it_ms] << 6))
        time.sleep_ms(3)  # >= 2.5 ms after ALS_SD = 0 before the first measurement
        time.sleep_ms(it_ms + it_ms // 10 + 5)  # wait for the first complete integration

    def raw(self):
        """ALS channel output counts (0..65535)."""
        return self._read(_ALS)

    def white(self):
        """WHITE channel output counts (0..65535); no lux conversion is specified for it."""
        return self._read(_WHITE)

    def lux(self):
        """Light level in lx: ALS counts x resolution (datasheet / app note formula, uncorrected)."""
        return self.raw() * self.resolution

    def lux_corrected(self):
        """Lux with the app note's polynomial correction, for gain 1/4 or 1/8 above about 1000 lx."""
        x = self.lux()
        return ((6.0135e-13 * x - 9.3924e-9) * x + 8.1488e-5) * x * x + 1.0023 * x

    def shutdown(self, off=True):
        """ALS_SD: stop measuring (about 0.5 uA); the last result stays readable. off=False powers on again."""
        cfg = self._read(_ALS_CONF)
        if off:
            self._write(_ALS_CONF, cfg | 0x0001)
        else:
            self._write(_ALS_CONF, cfg & ~0x0001)
            time.sleep_ms(3 + self.it_ms + self.it_ms // 10 + 5)
