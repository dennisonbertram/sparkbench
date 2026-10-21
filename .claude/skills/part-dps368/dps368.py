# MicroPython driver for the Infineon DPS368 barometric pressure / temperature sensor (I2C).
# Written from the Infineon datasheet "DPS368 Digital XENSIV barometric pressure sensor" v1.1 (2019-07-03):
#   operating modes sec. 4.1, I2C address sec. 4.5, compensation sec. 4.9.1 / 4.9.2,
#   scale factors table 9 (sec. 4.9.3), timing table 8, register map sec. 7,
#   PRS_CFG / TMP_CFG / MEAS_CFG / CFG_REG / RESET sec. 8.3-8.9, measurement times table 16,
#   calibration coefficients table 18 (sec. 8.11), coefficient source sec. 8.12.
import time

REG_PSR = 0x00        # PSR_B2..B0: 24-bit two's complement pressure result
REG_TMP = 0x03        # TMP_B2..B0: 24-bit two's complement temperature result
REG_PRS_CFG = 0x06    # PM_RATE[6:4] PM_PRC[3:0]
REG_TMP_CFG = 0x07    # TMP_EXT[7] TMP_RATE[6:4] TMP_PRC[3:0]
REG_MEAS_CFG = 0x08   # COEF_RDY[7] SENSOR_RDY[6] TMP_RDY[5] PRS_RDY[4] MEAS_CTRL[2:0]
REG_CFG = 0x09        # INT_HL INT_SEL[6:4] T_SHIFT[3] P_SHIFT[2] FIFO_EN[1] SPI_MODE[0]
REG_RESET = 0x0C      # FIFO_FLUSH[7] SOFT_RST[3:0] = 1001
REG_ID = 0x0D         # REV_ID[7:4] PROD_ID[3:0]; reset value 0x10
REG_COEF = 0x10       # 0x10..0x21: c0, c1, c00, c10, c01, c11, c20, c21, c30
REG_COEF_SRCE = 0x28  # bit7 TMP_COEF_SRCE: coefficients made with the MEMS (external) temperature sensor

MEAS_PRS = 0x01       # command mode: one pressure measurement
MEAS_TMP = 0x02       # command mode: one temperature measurement

# Table 9: compensation scale factor kP / kT for oversampling code 0..7 (1, 2, 4 ... 128 times)
SCALE = (524288, 1572864, 3670016, 7864320, 253952, 516096, 1040384, 2088960)
# Table 16: measurement time in ms for oversampling code 0..7
MEAS_MS = (3.6, 5.2, 8.4, 14.8, 27.6, 53.2, 104.4, 206.8)


def _twos(v, bits):
    return v - (1 << bits) if v & (1 << (bits - 1)) else v


class DPS368:
    def __init__(self, i2c, addr=0x77, prs_osr=4, tmp_osr=0):
        """addr 0x77 (SDO floating, Shield2Go default) or 0x76 (SDO pulled to GND, Shield2Go bridge J1).
        Oversampling codes 0..7 = 1, 2, 4, 8, 16, 32, 64, 128 times
        (default: pressure 16x 'Standard', temperature single)."""
        self.i2c = i2c
        self.addr = addr
        pid = self._r(REG_ID, 1)[0]
        if pid != 0x10:
            raise OSError("DPS368 not found at 0x%02X (ID register 0x%02X, expected 0x10)" % (addr, pid))
        self._w(REG_RESET, 0x09)  # soft reset: runs the same sequence as power-on
        time.sleep_ms(40)  # table 8: sensor ready <= 12 ms, coefficients ready <= 40 ms
        self._wait_bits(0xC0, 100, "coefficients / sensor not ready")  # COEF_RDY and SENSOR_RDY
        self._load_coef()
        # Sec. 8.4 / 8.12: use the temperature sensor the coefficients were made with (TMP_EXT = TMP_COEF_SRCE).
        self.tmp_ext = self._r(REG_COEF_SRCE, 1)[0] & 0x80
        self._fix_temperature()
        self.set_oversampling(prs_osr, tmp_osr)
        self.t_raw_sc = None

    def _fix_temperature(self):
        # Undocumented register sequence from Infineon's own DPS3xx Arduino library
        # (DpsClass::correctTemp, run for DPS310 and DPS368): fixes ICs with a fuse-bit fault
        # that report a wrong temperature; "should not affect ICs without this problem".
        for reg, val in ((0x0E, 0xA5), (0x0F, 0x96), (0x62, 0x02), (0x0E, 0x00), (0x0F, 0x00)):
            self._w(reg, val)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _wait_bits(self, mask, timeout_ms, err):
        t0 = time.ticks_ms()
        while (self._r(REG_MEAS_CFG, 1)[0] & mask) != mask:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError("DPS368 " + err)
            time.sleep_ms(2)

    def _load_coef(self):
        c = self._r(REG_COEF, 18)  # table 18, one auto-increment burst
        self.c0 = _twos((c[0] << 4) | (c[1] >> 4), 12)
        self.c1 = _twos(((c[1] & 0x0F) << 8) | c[2], 12)
        self.c00 = _twos((c[3] << 12) | (c[4] << 4) | (c[5] >> 4), 20)
        self.c10 = _twos(((c[5] & 0x0F) << 16) | (c[6] << 8) | c[7], 20)
        self.c01 = _twos((c[8] << 8) | c[9], 16)
        self.c11 = _twos((c[10] << 8) | c[11], 16)
        self.c20 = _twos((c[12] << 8) | c[13], 16)
        self.c21 = _twos((c[14] << 8) | c[15], 16)
        self.c30 = _twos((c[16] << 8) | c[17], 16)

    def set_oversampling(self, prs_osr, tmp_osr):
        self.prs_osr = prs_osr & 0x07
        self.tmp_osr = tmp_osr & 0x07
        self.kP = SCALE[self.prs_osr]
        self.kT = SCALE[self.tmp_osr]
        self._w(REG_PRS_CFG, self.prs_osr)  # PM_RATE only matters in background mode
        self._w(REG_TMP_CFG, self.tmp_ext | self.tmp_osr)
        # Table 9 / sec. 8.6: result bit-shift must be enabled when oversampling is more than 8 times.
        cfg = (0x04 if self.prs_osr > 3 else 0) | (0x08 if self.tmp_osr > 3 else 0)
        self._w(REG_CFG, cfg)

    def _measure(self, ctrl, ready_bit, reg, osr):
        # Command mode (sec. 4.1): one measurement, then the sensor returns to standby.
        self._w(REG_MEAS_CFG, ctrl)
        time.sleep_ms(int(MEAS_MS[osr]) + 1)
        self._wait_bits(ready_bit, int(MEAS_MS[osr]) * 2 + 20, "measurement timed out")
        d = self._r(reg, 3)
        return _twos((d[0] << 16) | (d[1] << 8) | d[2], 24)

    def read_temperature_raw(self):
        return self._measure(MEAS_TMP, 0x20, REG_TMP, self.tmp_osr)

    def read_pressure_raw(self):
        return self._measure(MEAS_PRS, 0x10, REG_PSR, self.prs_osr)

    def temperature(self):
        """Degrees C (sec. 4.9.2: Tcomp = c0 * 0.5 + c1 * Traw_sc)."""
        t_raw_sc = self.read_temperature_raw() / self.kT
        self.t_raw_sc = t_raw_sc
        return self.c0 * 0.5 + self.c1 * t_raw_sc

    def pressure(self):
        """Pascal (sec. 4.9.1). Uses the latest temperature reading; measures one if there is none."""
        if self.t_raw_sc is None:
            self.temperature()
        p = self.read_pressure_raw() / self.kP
        t = self.t_raw_sc
        return (self.c00 + p * (self.c10 + p * (self.c20 + p * self.c30))
                + t * self.c01 + t * p * (self.c11 + p * self.c21))

    def read(self):
        """Returns (temperature degC, pressure hPa): a fresh temperature, then pressure compensated with it."""
        t = self.temperature()
        p = self.pressure() / 100.0
        return t, p

    def altitude(self, sea_level_hpa=1013.25):
        """Approximate altitude in metres from the international barometric formula."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
