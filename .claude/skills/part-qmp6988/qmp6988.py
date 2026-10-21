# QMP6988 barometric pressure & temperature sensor (QST), MicroPython driver.
# Written from the QST QMP6988 datasheet rev C: chip id 0x5C at 0xD1, soft reset 0xE6 -> 0xE0,
# 25 OTP compensation bytes at 0xA0-0xB8, forced-mode measurement via CTRL_MEAS (0xF4),
# 24-bit raw pressure at 0xF7-0xF9 and temperature at 0xFA-0xFC (MSB first), and the
# datasheet's compensation formulas (section 4.3).
import time

_CHIP_ID = 0xD1
_RESET = 0xE0
_DEVICE_STAT = 0xF3
_CTRL_MEAS = 0xF4
_IIR = 0xF1
_PRESS_TXD2 = 0xF7
_COE = 0xA0

# Conversion factors K = A + S * OTP / 32767 (datasheet table, section 4.3): name -> (offset in OTP block, A, S)
_K = (
    ('bt1', 2, 1.00e-1, 9.10e-2),
    ('bt2', 4, 1.20e-8, 1.20e-6),
    ('bp1', 6, 3.30e-2, 1.90e-2),
    ('b11', 8, 2.10e-7, 1.40e-7),
    ('bp2', 10, -6.30e-10, 3.50e-10),
    ('b12', 12, 2.90e-13, 7.60e-13),
    ('b21', 14, 2.10e-15, 1.20e-14),
    ('bp3', 16, 1.30e-16, 7.90e-17),
    ('a1', 20, -6.30e-3, 4.30e-4),
    ('a2', 22, -1.90e-11, 1.20e-10),
)


def _s16(b, i):
    v = (b[i] << 8) | b[i + 1]
    return v - 65536 if v & 0x8000 else v


def _s20(v):
    return v - 0x100000 if v & 0x80000 else v


class QMP6988:
    def __init__(self, i2c, addr=0x70):
        """addr: 0x70 with SDO tied to GND, 0x56 with SDO tied to VDDIO."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(_CHIP_ID, 1)[0]
        if cid != 0x5C:
            raise OSError('QMP6988 not found (chip id 0x%02x)' % cid)
        self._w(_RESET, 0xE6)       # soft reset, then the chip reloads its OTP
        time.sleep_ms(10)           # power-on/reset start-up time is at most 10 ms
        c = self._r(_COE, 25)       # 0xA0 ... 0xB8
        k = {}
        for name, i, a, s in _K:
            k[name] = a + s * _s16(c, i) / 32767
        # a0 and b00 are 20-bit two's complement offsets in 20Q16 format (value / 16)
        k['b00'] = _s20((c[0] << 12) | (c[1] << 4) | (c[24] >> 4)) / 16
        k['a0'] = _s20((c[18] << 12) | (c[19] << 4) | (c[24] & 0x0F)) / 16
        self.k = k
        self._w(_IIR, 0x00)         # IIR filter off

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read(self):
        """One forced-mode measurement. Returns (pressure in Pa, temperature in degC)."""
        # Ultra high accuracy preset: temperature average x4 (011), pressure average x32 (110), forced mode (01)
        self._w(_CTRL_MEAS, (0b011 << 5) | (0b110 << 2) | 0b01)
        time.sleep_ms(34)           # 33.7 ms typical
        for _ in range(20):
            if not self._r(_DEVICE_STAT, 1)[0] & 0x08:   # bit 3 'measure' clears when data is stored
                break
            time.sleep_ms(5)
        d = self._r(_PRESS_TXD2, 6)
        dp = ((d[0] << 16) | (d[1] << 8) | d[2]) - 8388608
        dt = ((d[3] << 16) | (d[4] << 8) | d[5]) - 8388608
        k = self.k
        tr = k['a0'] + k['a1'] * dt + k['a2'] * dt * dt          # temperature in 1/256 degC
        pr = (k['b00'] + k['bt1'] * tr + k['bp1'] * dp + k['b11'] * tr * dp
              + k['bt2'] * tr * tr + k['bp2'] * dp * dp + k['b12'] * dp * tr * tr
              + k['b21'] * dp * dp * tr + k['bp3'] * dp * dp * dp)  # pressure in Pa
        return pr, tr / 256

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, sea_level_pa=101325.0):
        """Approximate altitude in metres from the barometric formula."""
        return 44330.0 * (1.0 - (self.read()[0] / sea_level_pa) ** 0.1903)
