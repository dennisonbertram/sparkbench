# TSL2572 (TSL25721) ambient light sensor (TAOS / ams), MicroPython driver.
# Written from the TSL2572 datasheet (TAOS132, March 2012):
#  - I2C address 0x39 (TSL25721/TSL25723); ID register 0x12 reads 0x34 (TSL25721/25725)
#    or 0x3D (TSL25723/25727).
#  - Every register access starts with a COMMAND byte: bit 7 = 1, bits 6:5 TYPE
#    (00 repeated byte, 01 auto-increment, 11 special function), bits 4:0 register address.
#    This driver uses auto-increment (0xA0 | reg); 0xE6 is the ALS interrupt clear.
#  - ENABLE (0x00): PON bit 0, AEN bit 1, WEN bit 3, AIEN bit 4, SAI bit 6.
#  - ATIME (0x01): integration time = 2.73 ms x (256 - ATIME); max count = min(65535, 1024 x (256 - ATIME)).
#  - CONFIG (0x0D): AGL bit 2 scales 1x/8x gain by 0.16 (do not use with 16x/120x).
#  - CONTROL (0x0F): AGAIN bits 1:0 = 1x, 8x, 16x, 120x.
#  - STATUS (0x13): AVALID bit 0. C0DATA 0x14/0x15, C1DATA 0x16/0x17, low byte first,
#    read with auto-increment so the high byte comes from the shadow register.
#  - Lux: CPL = (ATIME_ms x AGAINx) / (GA x 60); Lux1 = (C0 - 1.87 C1) / CPL;
#    Lux2 = (0.63 C0 - C1) / CPL; Lux = max(Lux1, Lux2, 0).
import time

_ADDR = 0x39
_CMD_AUTO = 0xA0
_CMD_CLEAR_INT = 0xE6

_ENABLE = 0x00
_ATIME = 0x01
_WTIME = 0x03
_PERS = 0x0C
_CONFIG = 0x0D
_CONTROL = 0x0F
_ID = 0x12
_STATUS = 0x13
_C0DATA = 0x14

_PON = 0x01
_AEN = 0x02
_AVALID = 0x01
_AGL = 0x04

_AGAIN = {1: 0, 8: 1, 16: 2, 120: 3}
_IDS = (0x34, 0x3D)


class TSL2572:
    def __init__(self, i2c, addr=_ADDR, atime=0xDB, again=1, agl=False, ga=1.0):
        """atime: 0xFF (2.73 ms) .. 0x00 (699 ms); default 0xDB = 101 ms (max count 37888).
        again: 1, 8, 16 or 120. agl: low-gain mode (only with 1x/8x, for up to 60k lux).
        ga: glass attenuation factor (1.0 in open air)."""
        if again not in _AGAIN:
            raise ValueError('again must be 1, 8, 16 or 120')
        if agl and again > 8:
            raise ValueError('AGL must not be used with 16x or 120x gain')
        self.i2c = i2c
        self.addr = addr
        dev_id = self._read8(_ID)
        if dev_id not in _IDS:
            raise OSError('TSL2572 not found (ID 0x%02X): check the wiring' % dev_id)
        self.atime = atime & 0xFF
        self.again = again
        self.agl = agl
        self.ga = ga
        self._write8(_ENABLE, 0x00)  # power down while configuring
        self._write8(_ATIME, self.atime)
        self._write8(_WTIME, 0xFF)
        self._write8(_PERS, 0x00)
        self._write8(_CONFIG, _AGL if agl else 0x00)
        self._write8(_CONTROL, _AGAIN[again])
        self._write8(_ENABLE, _PON | _AEN)
        # first result after ALS init (2.73 ms) + one integration
        time.sleep_ms(int(self.integration_ms() + 2.73) + 5)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.addr, _CMD_AUTO | reg, bytes((value & 0xFF,)))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, _CMD_AUTO | reg, n)

    def _read8(self, reg):
        return self._read(reg, 1)[0]

    def integration_ms(self):
        return 2.73 * (256 - self.atime)

    def gain(self):
        return self.again * (0.16 if self.agl else 1.0)

    def max_count(self):
        return min(65535, 1024 * (256 - self.atime))

    def raw(self):
        """(ch0, ch1): ch0 = visible + IR, ch1 = IR, counts from one integration cycle."""
        deadline = time.ticks_add(time.ticks_ms(), int(self.integration_ms() * 2) + 100)
        while not (self._read8(_STATUS) & _AVALID):
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('TSL2572 timed out waiting for a reading')
            time.sleep_ms(5)
        d = self._read(_C0DATA, 4)
        return d[0] | (d[1] << 8), d[2] | (d[3] << 8)

    def lux(self, ch0=None, ch1=None):
        """Illuminance in lux from the datasheet equation."""
        if ch0 is None or ch1 is None:
            ch0, ch1 = self.raw()
        cpl = (self.integration_ms() * self.gain()) / (self.ga * 60.0)
        lux1 = (ch0 - 1.87 * ch1) / cpl
        lux2 = (0.63 * ch0 - ch1) / cpl
        return max(lux1, lux2, 0.0)

    def saturated(self, ch0):
        return ch0 >= self.max_count()

    def clear_interrupt(self):
        self.i2c.writeto(self.addr, bytes((_CMD_CLEAR_INT,)))

    def sleep(self):
        self._write8(_ENABLE, 0x00)
