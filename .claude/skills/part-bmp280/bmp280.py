# MicroPython driver for Bosch BMP280 pressure/temperature sensor (I2C)
# Written from Bosch datasheet BST-BMP280-DS001 rev 1.26:
#   registers sec. 4, calibration table 17 (sec. 3.11.2), float compensation sec. 8.1,
#   measurement time table 13 (sec. 3.8.1).
import time

REG_CALIB = 0x88     # 0x88..0x9F: dig_T1..dig_P9, little-endian 16-bit
REG_CHIP_ID = 0xD0   # reads 0x58
REG_RESET = 0xE0     # write 0xB6 for a power-on reset
REG_STATUS = 0xF3    # bit3 measuring, bit0 im_update
REG_CTRL_MEAS = 0xF4 # osrs_t[7:5] osrs_p[4:2] mode[1:0]
REG_CONFIG = 0xF5    # t_sb[7:5] filter[4:2] spi3w_en[0]
REG_DATA = 0xF7      # 0xF7..0xFC: press msb/lsb/xlsb, temp msb/lsb/xlsb

CHIP_ID = 0x58


def _s16(v):
    return v - 65536 if v > 32767 else v


class BMP280:
    def __init__(self, i2c, addr=0x76, osrs_t=1, osrs_p=1):
        """osrs codes: 1=x1, 2=x2, 3=x4, 4=x8, 5=x16 (table 21/22)."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid != CHIP_ID:
            raise OSError("BMP280 not found at 0x%02X (chip id 0x%02X; a BME280 reads 0x60)" % (addr, cid))
        self._w(REG_RESET, 0xB6)
        time.sleep_ms(3)  # start-up time after reset: 2 ms max
        for _ in range(50):
            if not (self._r(REG_STATUS, 1)[0] & 0x01):  # im_update: NVM copy in progress
                break
            time.sleep_ms(1)
        self._load_calib()
        self.osrs_t = osrs_t & 0x07
        self.osrs_p = osrs_p & 0x07
        self._w(REG_CONFIG, 0x00)  # filter off, 4-wire SPI / I2C (writable in sleep mode)
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x00)  # sleep mode
        self.t_fine = 0

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _load_calib(self):
        c = self._r(REG_CALIB, 24)
        w = [c[2 * k] | (c[2 * k + 1] << 8) for k in range(12)]
        self.T1 = w[0]            # unsigned
        self.T2 = _s16(w[1])
        self.T3 = _s16(w[2])
        self.P1 = w[3]            # unsigned
        self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9 = [_s16(x) for x in w[4:12]]

    def _measure(self):
        # Forced mode: one conversion, then the chip returns to sleep by itself.
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x01)
        # Table 13: x1/x1 takes 6.4 ms max; up to 43.2 ms at x16/x2. Wait, then poll 'measuring'.
        time.sleep_ms(7)
        for _ in range(50):
            if not (self._r(REG_STATUS, 1)[0] & 0x08):
                break
            time.sleep_ms(2)
        d = self._r(REG_DATA, 6)  # one burst read so both values come from the same conversion
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        return adc_t, adc_p

    def _comp_t(self, adc_t):
        # Datasheet 8.1 bmp280_compensate_T_double; returns degC
        var1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        var2 = (adc_t / 131072.0 - self.T1 / 8192.0) * (adc_t / 131072.0 - self.T1 / 8192.0) * self.T3
        self.t_fine = int(var1 + var2)
        return (var1 + var2) / 5120.0

    def _comp_p(self, adc_p):
        # Datasheet 8.1 bmp280_compensate_P_double; returns Pa
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

    def read(self):
        """Returns (temperature degC, pressure hPa)."""
        adc_t, adc_p = self._measure()
        if adc_t == 0x80000:
            raise OSError("BMP280 temperature skipped (osrs_t = 0)")
        t = self._comp_t(adc_t)  # must run first: sets t_fine for pressure
        p = self._comp_p(adc_p) / 100.0
        return t, p

    def temperature(self):
        return self.read()[0]

    def pressure(self):
        return self.read()[1]

    def altitude(self, sea_level_hpa=1013.25):
        """Approximate altitude in metres from the barometric formula."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
