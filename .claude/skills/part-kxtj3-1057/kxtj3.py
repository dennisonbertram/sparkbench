# KXTJ3-1057 3-axis accelerometer (Kionix / ROHM), MicroPython driver for I2C.
# From the KXTJ3-1057 Specifications (Rev 4.0, 05-Oct-2018):
#   I2C address 0x0E (ADDR to GND) or 0x0F (ADDR to IO_VDD). WHO_AM_I 0x0F = 0x35. DCST_RESP 0x0C = 0x55.
#   Power-up (supply valid to boot complete) takes up to 30 ms; the chip NACKs until then.
#   CTRL_REG1 0x1B: PC1 bit 7 (1 = operating, 0 = stand-by), RES bit 6 (1 = high resolution 12/14-bit,
#     0 = low power 8-bit), DRDYE bit 5, GSEL1 bit 4, GSEL0 bit 3, EN16G bit 2, WUFE bit 1.
#     CTRL_REG1, CTRL_REG2, INT_CTRL_REG1/2 and DATA_CTRL_REG may only be changed while PC1 = 0.
#   Range (Table 12): GSEL1 GSEL0 EN16G = 000 +-2 g, 010 +-4 g, 100 +-8 g, 110 +-8 g 14-bit,
#     001 +-16 g, 111 +-16 g 14-bit (14-bit only with RES = 1).
#   DATA_CTRL_REG 0x21: OSA[3:0] output data rate, 0x02 = 50 Hz (reset value).
#   XOUT_L..ZOUT_H 0x06-0x0B: two's complement, low byte first, LEFT-justified:
#     12-bit data in bits 15:4, 14-bit data in bits 15:2. Read all six bytes in one burst.
#   Sensitivity (counts/g): 12-bit 1024 / 512 / 256 / 128 at +-2/4/8/16 g; 14-bit 1024 (+-8 g), 512 (+-16 g).
#   Start-up after PC1 = 1 is about 1/ODR.
import time

_DCST_RESP = 0x0C
_WHO_AM_I = 0x0F
_XOUT_L = 0x06
_CTRL_REG1 = 0x1B
_DATA_CTRL_REG = 0x21

_PC1 = 0x80
_RES = 0x40

# (g_range, bits) -> (CTRL_REG1 GSEL1/GSEL0/EN16G bits, right shift, counts per g)
_MODES = {
    (2, 12): (0x00, 4, 1024),
    (4, 12): (0x08, 4, 512),
    (8, 12): (0x10, 4, 256),
    (16, 12): (0x04, 4, 128),
    (8, 14): (0x18, 2, 1024),
    (16, 14): (0x1C, 2, 512),
}

# Output data rate in Hz -> OSA[3:0] (Table 14)
_ODR = {0.781: 0x08, 1.563: 0x09, 3.125: 0x0A, 6.25: 0x0B, 12.5: 0x00, 25: 0x01,
        50: 0x02, 100: 0x03, 200: 0x04, 400: 0x05, 800: 0x06, 1600: 0x07}


class KXTJ3:
    def __init__(self, i2c, addr=0x0E, g_range=2, bits=12, odr=50):
        """addr: 0x0E (PTSolns I2Connect default, ADDR to GND) or 0x0F (ADDR pad changed).
        g_range: 2, 4, 8 or 16 g. bits: 12, or 14 with g_range 8 or 16. odr: output data rate in Hz."""
        if (g_range, bits) not in _MODES:
            raise ValueError('use g_range 2/4/8/16 with bits=12, or g_range 8/16 with bits=14')
        if odr not in _ODR:
            raise ValueError('odr must be one of %s' % sorted(_ODR))
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(30)  # power-up time max 30 ms: the chip NACKs until boot completes
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x35:
            raise OSError('KXTJ3 not found (WHO_AM_I 0x%02X, expected 0x35): check wiring/address' % who)
        gbits, self._shift, self._counts_per_g = _MODES[(g_range, bits)]
        self._w(_CTRL_REG1, 0x00)  # stand-by: settings may only change with PC1 = 0
        self._w(_DATA_CTRL_REG, _ODR[odr])
        self._w(_CTRL_REG1, _PC1 | _RES | gbits)  # operating, high resolution, chosen range
        # start-up is about 1/ODR after PC1 = 1; wait two sample periods plus margin
        time.sleep_ms(int(2000 / odr) + 10)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def raw(self):
        """(x, y, z) as 12- or 14-bit signed counts, read in one 6-byte burst from XOUT_L."""
        d = self.i2c.readfrom_mem(self.addr, _XOUT_L, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # low byte first
            if v & 0x8000:
                v -= 65536
            out.append(v >> self._shift)  # data is left-justified
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._counts_per_g
        x, y, z = self.raw()
        return x / k, y / k, z / k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())

    def standby(self):
        """Stop measuring (0.9 uA)."""
        c = self.i2c.readfrom_mem(self.addr, _CTRL_REG1, 1)[0]
        self._w(_CTRL_REG1, c & ~_PC1)
