# MicroPython driver for the Bosch BMP390 pressure/temperature sensor (I2C)
# Written from Bosch datasheet BST-BMP390-DS002-07 rev 1.7:
#   register map sec. 4.2/4.3, trimming coefficients table 24 (sec. 3.11.1),
#   coefficient scaling sec. 8.4, temperature 8.5, pressure 8.6 (float compensation),
#   measurement time sec. 3.9.2.
import time

REG_CHIP_ID = 0x00   # 0x60 on BMP390
REG_ERR = 0x02       # bit0 fatal_err, bit1 cmd_err, bit2 conf_err
REG_STATUS = 0x03    # bit4 cmd_rdy, bit5 drdy_press, bit6 drdy_temp
REG_DATA = 0x04      # 0x04..0x09: press 7_0/15_8/23_16, temp 7_0/15_8/23_16 (24-bit unsigned, LSB first)
REG_PWR_CTRL = 0x1B  # bit0 press_en, bit1 temp_en, bits5:4 mode (00 sleep, 01/10 forced, 11 normal)
REG_OSR = 0x1C       # bits2:0 osr_p, bits5:3 osr_t (0=x1 ... 5=x32)
REG_ODR = 0x1D
REG_CONFIG = 0x1F    # bits3:1 IIR filter coefficient
REG_CALIB = 0x31     # 0x31..0x45: NVM_PAR_T1 .. NVM_PAR_P11 (21 bytes)
REG_CMD = 0x7E       # 0xB6 = softreset

CHIP_ID = 0x60


def _u16(b, i):
    return b[i] | (b[i + 1] << 8)


def _s16(b, i):
    v = _u16(b, i)
    return v - 65536 if v > 32767 else v


def _s8(b, i):
    v = b[i]
    return v - 256 if v > 127 else v


class BMP390:
    def __init__(self, i2c, addr=0x77, osr_p=3, osr_t=0):
        """addr 0x77 (SDO high, Adafruit default) or 0x76 (SDO to GND / ADDR jumper).
        osr codes: 0=x1, 1=x2, 2=x4, 3=x8, 4=x16, 5=x32 (table 43)."""
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(2)  # start-up time 2 ms
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid != CHIP_ID:
            raise OSError("BMP390 not found at 0x%02X (chip id 0x%02X, expected 0x60)" % (addr, cid))
        self._soft_reset()
        self._load_calib()
        self.osr_p = osr_p & 0x07
        self.osr_t = osr_t & 0x07
        self._w(REG_PWR_CTRL, 0x00)  # sleep while configuring
        self._w(REG_CONFIG, 0x00)    # IIR filter off
        self._w(REG_OSR, (self.osr_t << 3) | self.osr_p)
        self._w(REG_ODR, 0x00)
        self.t_lin = 0.0

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _wait_cmd_rdy(self):
        for _ in range(20):
            if self._r(REG_STATUS, 1)[0] & 0x10:
                return
            time.sleep_ms(1)

    def _soft_reset(self):
        # CMD 0xB6 = softreset (sec. 4.3.22); only accepted when cmd_rdy is set.
        self._wait_cmd_rdy()
        self._w(REG_CMD, 0xB6)
        time.sleep_ms(3)
        self._wait_cmd_rdy()
        if self._r(REG_ERR, 1)[0] & 0x02:
            raise OSError("BMP390 soft reset failed (cmd_err)")

    def _load_calib(self):
        c = self._r(REG_CALIB, 21)
        # Sec. 8.4: convert the NVM integers to floating-point coefficients.
        self.par_t1 = _u16(c, 0) / 2.0 ** -8
        self.par_t2 = _u16(c, 2) / 2.0 ** 30
        self.par_t3 = _s8(c, 4) / 2.0 ** 48
        self.par_p1 = (_s16(c, 5) - 2 ** 14) / 2.0 ** 20
        self.par_p2 = (_s16(c, 7) - 2 ** 14) / 2.0 ** 29
        self.par_p3 = _s8(c, 9) / 2.0 ** 32
        self.par_p4 = _s8(c, 10) / 2.0 ** 37
        self.par_p5 = _u16(c, 11) / 2.0 ** -3
        self.par_p6 = _u16(c, 13) / 2.0 ** 6
        self.par_p7 = _s8(c, 15) / 2.0 ** 8
        self.par_p8 = _s8(c, 16) / 2.0 ** 15
        self.par_p9 = _s16(c, 17) / 2.0 ** 48
        self.par_p10 = _s8(c, 19) / 2.0 ** 48
        self.par_p11 = _s8(c, 20) / 2.0 ** 65

    def _measure(self):
        # Forced mode, pressure and temperature enabled; the chip returns to sleep afterwards.
        self._w(REG_PWR_CTRL, 0x13)
        # Sec. 3.9.2: T_conv = 234 + (392 + 2^osr_p * 2020) + (163 + 2^osr_t * 2020) us
        t_us = 234 + 392 + (1 << self.osr_p) * 2020 + 163 + (1 << self.osr_t) * 2020
        time.sleep_ms(t_us // 1000 + 2)
        for _ in range(100):
            if (self._r(REG_STATUS, 1)[0] & 0x60) == 0x60:  # drdy_temp and drdy_press
                break
            time.sleep_ms(2)
        else:
            raise OSError("BMP390 measurement timed out")
        if self._r(REG_ERR, 1)[0] & 0x04:
            raise OSError("BMP390 configuration error (conf_err)")
        d = self._r(REG_DATA, 6)  # one burst read press_xlsb..temp_msb (sec. 3.10)
        adc_p = d[0] | (d[1] << 8) | (d[2] << 16)
        adc_t = d[3] | (d[4] << 8) | (d[5] << 16)
        return adc_t, adc_p

    def _comp_t(self, uncomp_temp):
        # Sec. 8.5; returns degC and keeps t_lin for the pressure formula.
        pd1 = uncomp_temp - self.par_t1
        pd2 = pd1 * self.par_t2
        self.t_lin = pd2 + (pd1 * pd1) * self.par_t3
        return self.t_lin

    def _comp_p(self, uncomp_press):
        # Sec. 8.6; returns Pa.
        t = self.t_lin
        out1 = self.par_p5 + self.par_p6 * t + self.par_p7 * (t * t) + self.par_p8 * (t * t * t)
        out2 = uncomp_press * (self.par_p1 + self.par_p2 * t + self.par_p3 * (t * t) + self.par_p4 * (t * t * t))
        up = float(uncomp_press)
        pd4 = up * up * (self.par_p9 + self.par_p10 * t) + (up * up * up) * self.par_p11
        return out1 + out2 + pd4

    def read(self):
        """Returns (temperature degC, pressure hPa)."""
        adc_t, adc_p = self._measure()
        t = self._comp_t(adc_t)  # must run first: sets t_lin
        p = self._comp_p(adc_p) / 100.0
        return t, p

    def temperature(self):
        return self.read()[0]

    def pressure(self):
        return self.read()[1]

    def altitude(self, sea_level_hpa=1013.25):
        """Approximate altitude in metres from the international barometric formula."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
