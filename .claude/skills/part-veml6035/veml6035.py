# VEML6035 low-lux ambient light sensor (Vishay, datasheet doc 84889 rev 1.3 + app note 84944), MicroPython driver.
# Fixed 7-bit I2C address 0x29. 16-bit registers ("command codes"), sent and received LSB first:
#   write: [command code, data LSB, data MSB]; read: command code, repeated start, LSB, MSB.
# Lux = ALS counts x resolution, where (app note formula)
#   resolution = 0.0004 lx/count x (800 / IT) x (2 if DG = 0) x (2 if GAIN = 0) x (8 if SENS = 1).
# Driver default GAIN = 0, DG = 0, SENS = 1, IT = 100 ms: 0.1024 lx/count, up to about 6711 lx.
import time

_ALS_CONF = 0x00
_ALS_WH = 0x01
_ALS_WL = 0x02
_PSM = 0x03
_ALS = 0x04
_WHITE = 0x05
_ALS_INT = 0x06

# ALS_IT, bits 9:6 of ALS_CONF, keyed by integration time in ms
_IT_BITS = {25: 0b1100, 50: 0b1000, 100: 0b0000, 200: 0b0001, 400: 0b0010, 800: 0b0011}


class VEML6035:
    def __init__(self, i2c, addr=0x29, gain=0, dg=0, sens=1, it_ms=100, white=True):
        self.i2c = i2c
        self.addr = addr
        if addr not in i2c.scan():
            raise OSError('VEML6035 not found at 0x%02X' % addr)
        self._write(_PSM, 0x0000)  # power save mode off: a new result every integration time
        self.configure(gain, dg, sens, it_ms, white)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)  # LSB first

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def configure(self, gain=0, dg=0, sens=1, it_ms=100, white=True):
        """gain: 0 normal / 1 double; dg: 0 normal / 1 double; sens: 0 high (1x) / 1 low (1/8x);
        it_ms: 25, 50, 100, 200, 400 or 800. white=True also enables the WHITE channel (CHANNEL_EN).
        Powers the sensor on (SD = 0) and waits for the first complete measurement."""
        if it_ms not in _IT_BITS or gain not in (0, 1) or dg not in (0, 1) or sens not in (0, 1):
            raise ValueError('gain, dg, sens must be 0 or 1 and it_ms 25, 50, 100, 200, 400 or 800')
        self.it_ms = it_ms
        self.resolution = 0.0004 * (800 / it_ms) * (2 if dg == 0 else 1) * (2 if gain == 0 else 1) * (8 if sens else 1)
        # ALS_PERS = 1 (00), INT_CHANNEL = ALS, INT_EN = 0, SD = 0 (power on)
        cfg = (sens << 12) | (dg << 11) | (gain << 10) | (_IT_BITS[it_ms] << 6) | ((1 if white else 0) << 2)
        self._write(_ALS_CONF, cfg)
        time.sleep_ms(4)
        time.sleep_ms(it_ms + it_ms * 3 // 10 + 5)  # first complete integration (IT tolerance +-30 %)

    def raw(self):
        """ALS channel output counts (0..65535)."""
        return self._read(_ALS)

    def white(self):
        """WHITE channel output counts (0..65535); only updated when CHANNEL_EN = 1. No lux formula is given for it."""
        return self._read(_WHITE)

    def lux(self):
        """Light level in lx: ALS counts x resolution (datasheet / app note formula)."""
        return self.raw() * self.resolution

    def interrupt_status(self):
        """(low_crossed, high_crossed) flags from register 0x06 (bits 15 and 14)."""
        v = self._read(_ALS_INT)
        return bool(v & 0x8000), bool(v & 0x4000)

    def shutdown(self, off=True):
        """SD bit: off=True stops measuring (about 0.5 uA, last result stays readable); off=False powers on again."""
        cfg = self._read(_ALS_CONF)
        if off:
            self._write(_ALS_CONF, cfg | 0x0001)
        else:
            self._write(_ALS_CONF, cfg & ~0x0001)
            time.sleep_ms(4 + self.it_ms + self.it_ms * 3 // 10 + 5)
