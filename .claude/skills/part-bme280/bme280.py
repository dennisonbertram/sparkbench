# MicroPython driver for Bosch BME280 (I2C)
# Written from Bosch datasheet BST-BME280-DS002 (registers sec. 5, compensation sec. 4.2.3 / 8.1)
import time

REG_CHIP_ID = 0xD0   # reads 0x60
REG_RESET = 0xE0     # write 0xB6
REG_CTRL_HUM = 0xF2
REG_STATUS = 0xF3
REG_CTRL_MEAS = 0xF4
REG_CONFIG = 0xF5
REG_DATA = 0xF7      # 0xF7..0xFE: press[3], temp[3], hum[2]


def _s16(v):
    return v - 65536 if v > 32767 else v


def _s12(v):
    return v - 4096 if v > 2047 else v


class BME280:
    def __init__(self, i2c, addr=0x76, osrs=1):
        self.i2c = i2c
        self.addr = addr
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid != 0x60:
            raise OSError("BME280 not found (chip id 0x%02X)" % cid)
        self._w(REG_RESET, 0xB6)
        time.sleep_ms(5)
        while self._r(REG_STATUS, 1)[0] & 0x01:  # im_update: NVM copy in progress
            time.sleep_ms(1)
        self._load_calib()
        self.osrs = osrs & 0x07  # 1=x1, 2=x2, 3=x4, 4=x8, 5=x16
        self._w(REG_CONFIG, 0x00)          # filter off, no SPI3W
        self._w(REG_CTRL_HUM, self.osrs)   # must precede ctrl_meas
        self._w(REG_CTRL_MEAS, (self.osrs << 5) | (self.osrs << 2) | 0x00)  # sleep
        self.t_fine = 0.0

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _load_calib(self):
        c = self._r(0x88, 26)
        u = lambda i: c[i] | (c[i + 1] << 8)
        self.T1 = u(0)
        self.T2 = _s16(u(2))
        self.T3 = _s16(u(4))
        self.P1 = u(6)
        self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9 = [
            _s16(u(8 + 2 * k)) for k in range(8)]
        self.H1 = c[25]  # 0xA1
        h = self._r(0xE1, 7)
        self.H2 = _s16(h[0] | (h[1] << 8))
        self.H3 = h[2]
        self.H4 = _s12((h[3] << 4) | (h[4] & 0x0F))
        self.H5 = _s12((h[5] << 4) | (h[4] >> 4))
        self.H6 = h[6] - 256 if h[6] > 127 else h[6]

    def _measure(self):
        # forced mode: one conversion then back to sleep
        self._w(REG_CTRL_HUM, self.osrs)
        self._w(REG_CTRL_MEAS, (self.osrs << 5) | (self.osrs << 2) | 0x01)
        time.sleep_ms(2)
        for _ in range(100):
            if not (self._r(REG_STATUS, 1)[0] & 0x08):  # measuring bit
                break
            time.sleep_ms(2)
        d = self._r(REG_DATA, 8)
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        adc_h = (d[6] << 8) | d[7]
        return adc_t, adc_p, adc_h

    def _comp_t(self, adc_t):
        v1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        v2 = ((adc_t / 131072.0 - self.T1 / 8192.0) ** 2) * self.T3
        self.t_fine = v1 + v2
        return self.t_fine / 5120.0

    def _comp_p(self, adc_p):
        v1 = self.t_fine / 2.0 - 64000.0
        v2 = v1 * v1 * self.P6 / 32768.0
        v2 = v2 + v1 * self.P5 * 2.0
        v2 = v2 / 4.0 + self.P4 * 65536.0
        v1 = (self.P3 * v1 * v1 / 524288.0 + self.P2 * v1) / 524288.0
        v1 = (1.0 + v1 / 32768.0) * self.P1
        if v1 == 0:
            return 0.0
        p = 1048576.0 - adc_p
        p = (p - v2 / 4096.0) * 6250.0 / v1
        v1 = self.P9 * p * p / 2147483648.0
        v2 = p * self.P8 / 32768.0
        return p + (v1 + v2 + self.P7) / 16.0  # Pa

    def _comp_h(self, adc_h):
        h = self.t_fine - 76800.0
        h = (adc_h - (self.H4 * 64.0 + self.H5 / 16384.0 * h)) * (
            self.H2 / 65536.0 * (1.0 + self.H6 / 67108864.0 * h * (1.0 + self.H3 / 67108864.0 * h)))
        h = h * (1.0 - self.H1 * h / 524288.0)
        return min(max(h, 0.0), 100.0)

    def read(self):
        """Returns (temperature degC, pressure hPa, humidity %RH)."""
        adc_t, adc_p, adc_h = self._measure()
        t = self._comp_t(adc_t)
        p = self._comp_p(adc_p) / 100.0
        h = self._comp_h(adc_h)
        return t, p, h

    def temperature(self):
        return self.read()[0]

    def pressure(self):
        return self.read()[1]

    def humidity(self):
        return self.read()[2]

    def altitude(self, sea_level_hpa=1013.25):
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** 0.1903)
