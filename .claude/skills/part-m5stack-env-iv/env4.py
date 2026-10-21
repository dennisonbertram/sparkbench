# M5Stack ENV IV unit (U001-D) MicroPython driver: Sensirion SHT40 (0x44) + Bosch BMP280 (0x76) on one I2C bus.
# SHT40: Sensirion SHT4x datasheet - single-shot high precision command 0xFD (max 8.3 ms), 6-byte reply with
#   CRC-8 (poly 0x31, init 0xFF); T = -45 + 175*S/65535 degC, RH = -6 + 125*S/65535 %, RH cropped to 0..100 %.
# BMP280: Bosch BST-BMP280-DS001 - chip id 0x58 at 0xD0, calibration 0x88..0x9F (little-endian),
#   forced mode via 0xF4, data burst 0xF7..0xFC, floating-point compensation from section 8.1.
import time

SHT40_ADDR = 0x44
BMP280_ADDR = 0x76


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _s16(v):
    return v - 65536 if v > 32767 else v


class SHT40:
    def __init__(self, i2c, addr=SHT40_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # power-up time, max 1 ms

    def reset(self):
        self.i2c.writeto(self.addr, b'\x94')  # soft reset, ready after 1 ms
        time.sleep_ms(1)

    def read(self):
        """Measure once; returns (temperature degC, relative humidity %)."""
        self.i2c.writeto(self.addr, b'\xfd')
        time.sleep_ms(10)  # high precision takes up to 8.3 ms
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('SHT40 CRC mismatch: check the Grove cable')
        t = -45 + 175 * ((d[0] << 8) | d[1]) / 65535
        rh = -6 + 125 * ((d[3] << 8) | d[4]) / 65535
        return t, min(max(rh, 0.0), 100.0)


class BMP280:
    def __init__(self, i2c, addr=BMP280_ADDR, osrs_t=1, osrs_p=1):
        """osrs codes: 1=x1, 2=x2, 3=x4, 4=x8, 5=x16."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(0xD0, 1)[0]
        if cid != 0x58:
            raise OSError('BMP280 not found at 0x%02X (chip id 0x%02X)' % (addr, cid))
        self._w(0xE0, 0xB6)  # soft reset
        time.sleep_ms(3)  # start-up 2 ms max
        for _ in range(50):
            if not (self._r(0xF3, 1)[0] & 0x01):  # im_update: NVM copy running
                break
            time.sleep_ms(1)
        c = self._r(0x88, 24)
        w = [c[2 * k] | (c[2 * k + 1] << 8) for k in range(12)]
        self.T1 = w[0]
        self.T2 = _s16(w[1])
        self.T3 = _s16(w[2])
        self.P1 = w[3]
        self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9 = [_s16(x) for x in w[4:12]]
        self.osrs_t = osrs_t & 7
        self.osrs_p = osrs_p & 7
        self._w(0xF5, 0x00)  # filter off, standby default (written in sleep mode)
        self._w(0xF4, (self.osrs_t << 5) | (self.osrs_p << 2))  # sleep mode
        self.t_fine = 0

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _raw(self):
        self._w(0xF4, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x01)  # forced mode: one conversion
        time.sleep_ms(7)  # x1/x1 takes 6.4 ms max (table 13)
        for _ in range(50):
            if not (self._r(0xF3, 1)[0] & 0x08):  # measuring bit
                break
            time.sleep_ms(2)
        d = self._r(0xF7, 6)  # one burst so both values come from the same conversion
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        return adc_t, adc_p

    def _comp_t(self, adc_t):
        var1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        var2 = (adc_t / 131072.0 - self.T1 / 8192.0) * (adc_t / 131072.0 - self.T1 / 8192.0) * self.T3
        self.t_fine = int(var1 + var2)
        return (var1 + var2) / 5120.0

    def _comp_p(self, adc_p):
        var1 = self.t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * self.P6 / 32768.0
        var2 = var2 + var1 * self.P5 * 2.0
        var2 = var2 / 4.0 + self.P4 * 65536.0
        var1 = (self.P3 * var1 * var1 / 524288.0 + self.P2 * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * self.P1
        if var1 == 0.0:
            return 0.0
        p = 1048576.0 - adc_p
        p = (p - var2 / 4096.0) * 6250.0 / var1
        var1 = self.P9 * p * p / 2147483648.0
        var2 = p * self.P8 / 32768.0
        return p + (var1 + var2 + self.P7) / 16.0  # Pa

    def read(self):
        """Returns (temperature degC, pressure hPa)."""
        adc_t, adc_p = self._raw()
        if adc_t == 0x80000:
            raise OSError('BMP280 temperature skipped')
        t = self._comp_t(adc_t)  # first: sets t_fine for the pressure formula
        return t, self._comp_p(adc_p) / 100.0


class ENV4:
    """Both sensors of the ENV IV unit. read() -> (temperature degC from SHT40, humidity %, pressure hPa)."""

    def __init__(self, i2c):
        self.sht = SHT40(i2c)
        self.bmp = BMP280(i2c)

    def read(self):
        t, rh = self.sht.read()
        _, p = self.bmp.read()
        return t, rh, p

    def altitude(self, sea_level_hpa=1013.25):
        p = self.bmp.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
