# TCS34725 RGB colour sensor (ams/TAOS TCS3472 family), MicroPython driver.
# Written from the TCS3472 datasheet (TAOS135, Aug 2012):
#  - every register access starts with a COMMAND byte: bit 7 = 1 (CMD), bits 6:5 = TYPE
#    (00 repeated byte, 01 auto-increment), bits 4:0 = register address;
#  - power on (PON), wait at least 2.4 ms, then enable the RGBC ADC (AEN);
#  - integration time = 2.4 ms x (256 - ATIME), max count = min(65535, 1024 x (256 - ATIME));
#  - CDATA..BDATA (0x14-0x1B) are 16-bit little-endian; read them in one auto-increment
#    transaction so each high byte comes from the shadow register latched with its low byte.
import time

_CMD = 0x80
_AUTO_INC = 0x20
_ENABLE = 0x00
_ATIME = 0x01
_CONTROL = 0x0F
_ID = 0x12
_STATUS = 0x13
_CDATAL = 0x14

_PON = 0x01
_AEN = 0x02
_AVALID = 0x01

_GAINS = {1: 0x00, 4: 0x01, 16: 0x02, 60: 0x03}


class TCS34725:
    def __init__(self, i2c, addr=0x29, atime=0xC0, gain=4):
        """atime: 0xFF (2.4 ms) .. 0x00 (614 ms); default 0xC0 = 153.6 ms, full 0-65535 range.
        gain: 1, 4, 16 or 60."""
        self.i2c = i2c
        self.addr = addr
        dev_id = self._read8(_ID)
        # 0x44 = TCS34721/TCS34725, 0x4D = TCS34723/TCS34727 (sold on some clone boards)
        if dev_id not in (0x44, 0x4D):
            raise OSError('TCS34725 not found (ID 0x%02X): check the wiring' % dev_id)
        self.set_integration(atime)
        self.set_gain(gain)
        self._write8(_ENABLE, _PON)
        time.sleep_ms(3)  # datasheet: at least 2.4 ms after PON before enabling the ADC
        self._write8(_ENABLE, _PON | _AEN)

    def _write8(self, reg, value):
        self.i2c.writeto(self.addr, bytes((_CMD | reg, value & 0xFF)))

    def _read8(self, reg):
        self.i2c.writeto(self.addr, bytes((_CMD | reg,)))
        return self.i2c.readfrom(self.addr, 1)[0]

    def set_integration(self, atime):
        self.atime = atime & 0xFF
        self._write8(_ATIME, self.atime)

    def set_gain(self, gain):
        if gain not in _GAINS:
            raise ValueError('gain must be 1, 4, 16 or 60')
        self.gain = gain
        self._write8(_CONTROL, _GAINS[gain])

    def integration_ms(self):
        return 2.4 * (256 - self.atime)

    def max_count(self):
        return min(65535, 1024 * (256 - self.atime))

    def read_raw(self):
        """Return (clear, red, green, blue) ADC counts from a completed integration."""
        # RGBC init (2.4 ms) plus one integration cycle, then wait for AVALID.
        deadline = time.ticks_add(time.ticks_ms(), int(self.integration_ms() * 2) + 50)
        while not (self._read8(_STATUS) & _AVALID):
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('TCS34725 timed out waiting for a reading')
            time.sleep_ms(5)
        self.i2c.writeto(self.addr, bytes((_CMD | _AUTO_INC | _CDATAL,)))
        d = self.i2c.readfrom(self.addr, 8)
        c = d[0] | (d[1] << 8)
        r = d[2] | (d[3] << 8)
        g = d[4] | (d[5] << 8)
        b = d[6] | (d[7] << 8)
        return c, r, g, b

    def saturated(self, clear):
        return clear >= self.max_count()

    def sleep(self):
        self._write8(_ENABLE, 0x00)
