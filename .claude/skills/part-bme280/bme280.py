# MicroPython driver for the Bosch BME280 humidity / pressure / temperature sensor (I2C).
# Written from Bosch datasheet BST-BME280-DS001 rev 1.23:
#   trimming parameters table 16 (sec. 4.2.2), memory map table 18 (sec. 5.3),
#   ctrl_hum / ctrl_meas sec. 5.4.3-5.4.5, double-precision compensation sec. 8.1,
#   measurement time sec. 9.1.
import time

REG_CALIB_TP = 0x88   # 0x88..0x9F: dig_T1..dig_P9, little-endian 16-bit
REG_CALIB_H1 = 0xA1   # dig_H1, unsigned char
REG_CALIB_H = 0xE1    # 0xE1..0xE7: dig_H2..dig_H6
REG_CHIP_ID = 0xD0    # reads 0x60 on a BME280 (0x58 = BMP280, which has no humidity)
REG_RESET = 0xE0      # write 0xB6 for a power-on reset
REG_CTRL_HUM = 0xF2   # osrs_h[2:0]; only takes effect after a write to ctrl_meas
REG_STATUS = 0xF3     # bit3 measuring, bit0 im_update
REG_CTRL_MEAS = 0xF4  # osrs_t[7:5] osrs_p[4:2] mode[1:0]
REG_CONFIG = 0xF5     # t_sb[7:5] filter[4:2] spi3w_en[0]
REG_DATA = 0xF7       # 0xF7..0xFE: press(3), temp(3), hum(2)

CHIP_ID = 0x60


def _s16(v):
    return v - 65536 if v > 32767 else v


def _s8(v):
    return v - 256 if v > 127 else v


class BME280:
    def __init__(self, i2c, addr=0x76, osrs_t=1, osrs_p=1, osrs_h=1):
        """osrs codes: 1=x1, 2=x2, 3=x4, 4=x8, 5=x16 (tables 20, 23, 24)."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid != CHIP_ID:
            raise OSError("BME280 not found at 0x%02X (chip id 0x%02X; 0x58 is a BMP280 without humidity)" % (addr, cid))
        self._w(REG_RESET, 0xB6)
        time.sleep_ms(3)  # start-up time: 2 ms max
        for _ in range(50):
            if not (self._r(REG_STATUS, 1)[0] & 0x01):  # im_update: NVM copy in progress
                break
            time.sleep_ms(1)
        self._load_calib()
        self.osrs_t = osrs_t & 0x07
        self.osrs_p = osrs_p & 0x07
        self.osrs_h = osrs_h & 0x07
        self._w(REG_CONFIG, 0x00)  # filter off; written in sleep mode
        self._w(REG_CTRL_HUM, self.osrs_h)
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x00)  # sleep mode
        self.t_fine = 0

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _load_calib(self):
        c = self._r(REG_CALIB_TP, 24)
        w = [c[2 * k] | (c[2 * k + 1] << 8) for k in range(12)]
        self.T1 = w[0]  # unsigned
        self.T2 = _s16(w[1])
        self.T3 = _s16(w[2])
        self.P1 = w[3]  # unsigned
        self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9 = [_s16(x) for x in w[4:12]]
        self.H1 = self._r(REG_CALIB_H1, 1)[0]  # unsigned char
        h = self._r(REG_CALIB_H, 7)
        self.H2 = _s16(h[0] | (h[1] << 8))
        self.H3 = h[2]  # unsigned char
        # dig_H4 = 0xE4[11:4] | 0xE5[3:0]; dig_H5 = 0xE6[11:4] | 0xE5[7:4]; both signed 12-bit
        self.H4 = (_s8(h[3]) * 16) | (h[4] & 0x0F)
        self.H5 = (_s8(h[5]) * 16) | (h[4] >> 4)
        self.H6 = _s8(h[6])

    def _measure(self):
        # Forced mode: one conversion of T, P and H, then back to sleep.
        self._w(REG_CTRL_HUM, self.osrs_h)
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x01)
        # Sec. 9.1: x1/x1/x1 takes 9.3 ms max (up to ~113 ms at x16 on all three); wait, then poll 'measuring'.
        time.sleep_ms(10)
        for _ in range(100):
            if not (self._r(REG_STATUS, 1)[0] & 0x08):
                break
            time.sleep_ms(2)
        d = self._r(REG_DATA, 8)  # one burst read so all values come from the same conversion
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        adc_h = (d[6] << 8) | d[7]
        return adc_t, adc_p, adc_h

    def _comp_t(self, adc_t):
        # Datasheet 8.1 BME280_compensate_T_double; returns degC
        var1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        var2 = (adc_t / 131072.0 - self.T1 / 8192.0) * (adc_t / 131072.0 - self.T1 / 8192.0) * self.T3
        self.t_fine = int(var1 + var2)
        return (var1 + var2) / 5120.0

    def _comp_p(self, adc_p):
        # Datasheet 8.1 BME280_compensate_P_double; returns Pa
        var1 = self.t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * self.P6 / 32768.0
        var2 = var2 + var1 * self.P5 * 2.0
        var2 = var2 / 4.0 + self.P4 * 65536.0
        var1 = (self.P3 * var1 * var1 / 524288.0 + self.P2 * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * self.P1
        if var1 == 0.0:
            return 0.0  # avoid division by zero
        p = 1048576.0 - adc_p
        p = (p - var2 / 4096.0) * 6250.0 / var1
        var1 = self.P9 * p * p / 2147483648.0
        var2 = p * self.P8 / 32768.0
        return p + (var1 + var2 + self.P7) / 16.0

    def _comp_h(self, adc_h):
        # Datasheet 8.1 bme280_compensate_H_double; returns %RH clamped to 0..100
        var_h = self.t_fine - 76800.0
        var_h = (adc_h - (self.H4 * 64.0 + self.H5 / 16384.0 * var_h)) * (
            self.H2 / 65536.0 * (1.0 + self.H6 / 67108864.0 * var_h * (1.0 + self.H3 / 67108864.0 * var_h)))
        var_h = var_h * (1.0 - self.H1 * var_h / 524288.0)
        if var_h > 100.0:
            var_h = 100.0
        elif var_h < 0.0:
            var_h = 0.0
        return var_h

    def read(self):
        """Returns (temperature degC, pressure hPa, relative humidity %)."""
        adc_t, adc_p, adc_h = self._measure()
        if adc_t == 0x80000:
            raise OSError("BME280 temperature skipped (osrs_t = 0)")
        t = self._comp_t(adc_t)  # must run first: sets t_fine for pressure and humidity
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
        """Approximate altitude in metres from the barometric formula."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
