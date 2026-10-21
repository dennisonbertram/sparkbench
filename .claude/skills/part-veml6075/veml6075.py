# VEML6075 UVA/UVB light sensor (Vishay), MicroPython driver.
# Registers are 16 bits wide, sent low byte first (datasheet: "Data byte low" then "Data byte high").
# UV index from the Vishay application note "Designing the VEML6075 into an Application"
# (open-air coefficients, responsivity given for IT = 100 ms, normal dynamic).
import time

_UV_CONF = 0x00
_UVA = 0x07
_UVB = 0x09
_UVCOMP1 = 0x0A
_UVCOMP2 = 0x0B
_ID = 0x0C

_IT_MS = {50: 0, 100: 1, 200: 2, 400: 3, 800: 4}


class VEML6075:
    # Coefficients for no diffusor / open air (application note, table "UV coefficients and responsivity").
    A = 2.22
    B = 1.33
    C = 2.95
    D = 1.74
    UVA_RESP = 0.001461
    UVB_RESP = 0.002591

    def __init__(self, i2c, addr=0x10, it_ms=100):
        self.i2c = i2c
        self.addr = addr
        if self._read16(_ID) & 0xFF != 0x26:
            raise OSError('VEML6075 not found at 0x%02X: check the wiring' % addr)
        if it_ms not in _IT_MS:
            raise ValueError('integration time must be 50, 100, 200, 400 or 800 ms')
        self.it_ms = it_ms
        # UV_IT in bits 6:4, HD = 0 (normal dynamic), UV_AF = 0 (continuous), SD = 0 (power on).
        self._write16(_UV_CONF, _IT_MS[it_ms] << 4)
        time.sleep_ms(2 * it_ms + 10)  # let the first full integration finish

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([value & 0xFF, (value >> 8) & 0xFF]))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)

    def raw(self):
        """Return the raw counts (UVA, UVB, UVcomp1, UVcomp2)."""
        return (self._read16(_UVA), self._read16(_UVB),
                self._read16(_UVCOMP1), self._read16(_UVCOMP2))

    def read(self):
        """Return (UVA counts compensated, UVB counts compensated, UV index)."""
        uva, uvb, c1, c2 = self.raw()
        uva_calc = uva - self.A * c1 - self.B * c2
        uvb_calc = uvb - self.C * c1 - self.D * c2
        # Responsivity values are for IT = 100 ms; scale for other integration times.
        k = 100 / self.it_ms
        uvi = (uva_calc * self.UVA_RESP * k + uvb_calc * self.UVB_RESP * k) / 2
        return uva_calc, uvb_calc, max(0.0, uvi)

    def uv_index(self):
        return self.read()[2]

    def shutdown(self):
        self._write16(_UV_CONF, (_IT_MS[self.it_ms] << 4) | 0x01)
