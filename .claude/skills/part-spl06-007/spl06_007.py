# MicroPython driver for the Goertek SPL06-007 barometric pressure / temperature sensor (I2C).
# Written from the Goertek "SPL06-007 Digital pressure sensor" datasheet v1.0 (2017-05-17):
#   operating modes sec. 5.1, I2C sec. 5.3.1, compensation sec. 5.6.1 / 5.6.2, scale factors table 4,
#   register map table 7, PRS_CFG / TMP_CFG / MEAS_CFG / CFG_REG sec. 8.3-8.6, measurement times table 8,
#   soft reset sec. 8.9, ID sec. 8.10, calibration coefficients table 10 (sec. 8.11),
#   sensor / coefficient ready times table 3 (12 ms / 40 ms).
import time

REG_PSR = 0x00        # PSR_B2..B0: 24-bit two's complement pressure result, MSB first
REG_TMP = 0x03        # TMP_B2..B0: 24-bit two's complement temperature result, MSB first
REG_PRS_CFG = 0x06    # PM_RATE[6:4] PM_PRC[3:0]
REG_TMP_CFG = 0x07    # TMP_EXT[7] TMP_RATE[6:4] TMP_PRC[2:0]
REG_MEAS_CFG = 0x08   # COEF_RDY[7] SENSOR_RDY[6] TMP_RDY[5] PRS_RDY[4] MEAS_CTRL[2:0]
REG_CFG = 0x09        # INT_HL INT_FIFO INT_PRS INT_TMP T_SHIFT[3] P_SHIFT[2] FIFO_EN SPI_MODE
REG_RESET = 0x0C      # FIFO_FLUSH[7] SOFT_RST[3:0] = 1001
REG_ID = 0x0D         # PROD_ID[7:4] REV_ID[3:0]; reset value 0x10
REG_COEF = 0x10       # 0x10..0x21: c0, c1, c00, c10, c01, c11, c20, c21, c30

MEAS_PRS = 0x01       # command mode: one pressure measurement
MEAS_TMP = 0x02       # command mode: one temperature measurement

COEF_RDY = 0x80
SENSOR_RDY = 0x40
TMP_RDY = 0x20
PRS_RDY = 0x10

# Table 4: compensation scale factor kP / kT for oversampling code 0..7 (1, 2, 4 ... 128 times)
SCALE = (524288, 1572864, 3670016, 7864320, 253952, 516096, 1040384, 2088960)
# Table 8: measurement time in ms for oversampling code 0..7
MEAS_MS = (3.6, 5.2, 8.4, 14.8, 27.6, 53.2, 104.4, 206.8)


def _twos(v, bits):
    return v - (1 << bits) if v & (1 << (bits - 1)) else v


class SPL06:
    def __init__(self, i2c, addr=0x76, prs_osr=4, tmp_osr=0):
        """addr 0x76 (SDO to GND, as on the Jaycar XC3702) or 0x77 (SDO high / open).
        Oversampling codes 0..7 = 1, 2, 4, 8, 16, 32, 64, 128 times
        (default: pressure 16x 'Standard', temperature single as the datasheet recommends)."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(REG_ID, 1)[0]
        if cid >> 4 != 0x1:
            raise OSError("SPL06-007 not found at 0x%02X (ID register 0x%02X, expected 0x10)" % (addr, cid))
        self._w(REG_RESET, 0x09)  # soft reset: runs the power-on sequence again
        time.sleep_ms(40)  # table 3: coefficients available within 40 ms, sensor ready within 12 ms
        self._wait_bits(COEF_RDY | SENSOR_RDY, 200, "coefficients / sensor not ready")
        self._load_coef()
        self.set_oversampling(prs_osr, tmp_osr)
        self.t_raw_sc = None

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _wait_bits(self, mask, timeout_ms, err):
        t0 = time.ticks_ms()
        while (self._r(REG_MEAS_CFG, 1)[0] & mask) != mask:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError("SPL06-007 " + err)
            time.sleep_ms(2)

    def _load_coef(self):
        c = self._r(REG_COEF, 18)  # table 10, one auto-increment burst
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
        # Sec. 8.4: TMP_EXT = 1, "Please use the external sensor setting" (MEMS element sensor).
        self._w(REG_TMP_CFG, 0x80 | self.tmp_osr)
        # Sec. 8.6: the result bit-shift must be set when oversampling is more than 8 times.
        cfg = (0x04 if self.prs_osr > 3 else 0) | (0x08 if self.tmp_osr > 3 else 0)
        self._w(REG_CFG, cfg)

    def _measure(self, ctrl, ready_bit, reg, osr):
        # Command mode (sec. 5.1): one measurement, then the sensor returns to standby.
        self._w(REG_MEAS_CFG, ctrl)
        time.sleep_ms(int(MEAS_MS[osr]) + 1)
        self._wait_bits(ready_bit, int(MEAS_MS[osr]) * 2 + 20, "measurement timed out")
        d = self._r(reg, 3)
        return _twos((d[0] << 16) | (d[1] << 8) | d[2], 24)

    def read_temperature_raw(self):
        return self._measure(MEAS_TMP, TMP_RDY, REG_TMP, self.tmp_osr)

    def read_pressure_raw(self):
        return self._measure(MEAS_PRS, PRS_RDY, REG_PSR, self.prs_osr)

    def temperature(self):
        """Degrees C (sec. 5.6.2: Tcomp = c0 * 0.5 + c1 * Traw_sc)."""
        t_raw_sc = self.read_temperature_raw() / self.kT
        self.t_raw_sc = t_raw_sc
        return self.c0 * 0.5 + self.c1 * t_raw_sc

    def pressure(self):
        """Pascal (sec. 5.6.1). Uses the latest temperature reading; measures one if there is none."""
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
        """Approximate altitude in metres (sec. 6.3, international barometric formula)."""
        p = self.read()[1]
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
