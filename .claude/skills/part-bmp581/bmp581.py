# MicroPython driver for the Bosch BMP581 pressure/temperature sensor (I2C)
# Written from Bosch datasheet BST-BMP581-DS004-13:
#   power-up checks sec. 4.3.9, soft reset 4.3.10, forced mode 4.3.3/4.3.7,
#   data format 4.5 (T = raw/2^16 degC, p = raw/2^6 Pa), register map sec. 7,
#   timings table 2 (t_soft_res 2 ms, t_standby 2.5 ms, t_conv_p / t_conv_t).
# The BMP581 is factory-compensated: no calibration coefficients are needed.
import time

REG_CHIP_ID = 0x01     # 0x50 on BMP581 (and BMP580), 0x51 on BMP585
REG_INT_CONFIG = 0x14  # bit0 int_mode (1 latched), bit1 int_pol, bit2 int_od, bit3 int_en
REG_INT_SOURCE = 0x15  # bit0 drdy_data_reg_en
REG_TEMP_XLSB = 0x1D   # 0x1D..0x1F temperature (signed 24-bit, LSB first), 0x20..0x22 pressure
REG_INT_STATUS = 0x27  # clear-on-read: bit0 drdy_data_reg, bit4 por
REG_STATUS = 0x28      # bit1 status_nvm_rdy, bit2 status_nvm_err
REG_OSR_CONFIG = 0x36  # bits2:0 osr_t, bits5:3 osr_p, bit6 press_en
REG_ODR_CONFIG = 0x37  # bits1:0 pwr_mode (0 standby, 1 normal, 2 forced, 3 non-stop), bits6:2 odr, bit7 deep_dis
REG_CMD = 0x7E         # 0xB6 = soft reset

CHIP_IDS = (0x50, 0x51)

# Table 2 nominal conversion times in ms (index = OSR code 0..7 for x1..x128), +5 % tolerance.
_TCONV_P = (1.0, 1.7, 2.9, 5.4, 10.4, 20.4, 40.4, 80.4)
_TCONV_T = (1.0, 1.1, 1.5, 2.1, 3.3, 5.8, 10.8, 20.8)


class BMP581:
    def __init__(self, i2c, addr=0x47, osr_p=4, osr_t=0):
        """addr 0x47 (SDO high, SparkFun default) or 0x46 (SDO low / ADR jumper moved).
        osr codes 0..7 = x1, x2, x4, x8, x16, x32, x64, x128 (OSR_CONFIG, sec. 7.33)."""
        self.i2c = i2c
        self.addr = addr
        self.osr_p = osr_p & 0x07
        self.osr_t = osr_t & 0x07
        time.sleep_ms(3)  # t_powerup / t_startup
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid not in CHIP_IDS:
            raise OSError("BMP581 not found at 0x%02X (chip id 0x%02X, expected 0x50)" % (addr, cid))
        self.reset()
        # Standby with deep standby disabled (deep_dis = 1), keeping the reset ODR bits.
        odr = self._r(REG_ODR_CONFIG, 1)[0]
        self._odr_bits = (odr & 0x7C) | 0x80
        self._w(REG_ODR_CONFIG, self._odr_bits)
        time.sleep_us(2500)  # t_standby
        # INT pin: enabled, latched, active high, push-pull (sec. 6.2 advice for an unconnected INT);
        # data-ready interrupt source so INT_STATUS.drdy_data_reg reports finished conversions.
        self._w(REG_INT_CONFIG, 0x0B)
        self._w(REG_INT_SOURCE, 0x01)
        # Pressure enabled with the chosen oversampling (written in standby, sec. 4.3.8).
        self._w(REG_OSR_CONFIG, 0x40 | (self.osr_p << 3) | self.osr_t)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def reset(self):
        """Soft reset (0xB6 to CMD), then the post-power-up checks of sec. 4.3.9."""
        self._w(REG_CMD, 0xB6)
        time.sleep_ms(2)  # t_soft_res
        if self._r(REG_CHIP_ID, 1)[0] == 0:
            raise OSError("BMP581 chip id reads 0 after reset")
        st = self._r(REG_STATUS, 1)[0]
        if not (st & 0x02) or (st & 0x04):
            raise OSError("BMP581 NVM not ready or NVM error (STATUS 0x%02X)" % st)
        if not (self._r(REG_INT_STATUS, 1)[0] & 0x10):
            raise OSError("BMP581 soft reset did not complete (INT_STATUS.por not set)")

    def _measure(self):
        self._r(REG_INT_STATUS, 1)  # clear any stale status (clear-on-read)
        self._w(REG_ODR_CONFIG, self._odr_bits | 0x02)  # FORCED: one measurement, then back to standby
        t_ms = (_TCONV_P[self.osr_p] + _TCONV_T[self.osr_t]) * 1.05
        time.sleep_ms(int(t_ms) + 2)
        for _ in range(50):
            if self._r(REG_INT_STATUS, 1)[0] & 0x01:  # drdy_data_reg
                break
            time.sleep_ms(2)
        else:
            raise OSError("BMP581 measurement timed out")
        d = self._r(REG_TEMP_XLSB, 6)  # one burst read for data shadowing (sec. 4.5.1)
        raw_t = d[0] | (d[1] << 8) | (d[2] << 16)
        if raw_t & 0x800000:
            raw_t -= 1 << 24  # temperature is signed 24-bit
        raw_p = d[3] | (d[4] << 8) | (d[5] << 16)
        return raw_t, raw_p

    def read(self):
        """Returns (temperature degC, pressure Pa)."""
        raw_t, raw_p = self._measure()
        return raw_t / 65536.0, raw_p / 64.0

    def temperature(self):
        return self.read()[0]

    def pressure(self):
        return self.read()[1]

    def altitude(self, sea_level_pa=101325.0):
        """Approximate altitude in metres from the international barometric formula."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_pa) ** (1 / 5.255))
