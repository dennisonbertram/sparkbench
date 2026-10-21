# MicroPython driver for the Bosch BME688 gas, humidity, pressure & temperature sensor (I2C).
# Written from Bosch datasheet BST-BME688-DS000-03 rev 1.3:
#   quick start / forced mode sec. 3.5, floating-point compensation sec. 3.6 (temperature, pressure,
#   humidity), heater set-point res_heat_x sec. 3.6.5, gas resistance readout sec. 3.7 (table 17),
#   memory map sec. 5.2, gas_wait_x encoding sec. 5.3.4.3, run_gas<5> sec. 5.3.4.7, status bits sec. 5.3.6.
# The BME688 gas formula differs from the BME680's: there are no range constant tables; it uses
# var1 = 262144 >> gas_range, var2 = 4096 + 3 * (gas_adc - 512), R = 1e6 * var1 / var2 ohms,
# and the gas data of field 0 sits in 0x2C/0x2D (not 0x2A/0x2B).
import time

REG_RES_HEAT_VAL = 0x00    # signed heater resistance correction
REG_RES_HEAT_RANGE = 0x02  # bits 5:4
REG_FIELD0 = 0x1D          # meas_status_0 .. gas_r_lsb_0 (0x1D..0x2D, 17 bytes)
REG_RES_HEAT_0 = 0x5A
REG_GAS_WAIT_0 = 0x64
REG_CTRL_GAS_0 = 0x70      # heat_off bit 3
REG_CTRL_GAS_1 = 0x71      # run_gas bit 5, nb_conv 3:0
REG_CTRL_HUM = 0x72        # osrs_h 2:0
REG_CTRL_MEAS = 0x74       # osrs_t 7:5, osrs_p 4:2, mode 1:0
REG_CONFIG = 0x75          # filter 4:2
REG_CHIP_ID = 0xD0         # 0x61
REG_RESET = 0xE0           # write 0xB6
REG_VARIANT_ID = 0xF0      # 0x01 for BME688 (0x00 = BME680)
CHIP_ID = 0x61
VARIANT_BME688 = 0x01

_OS_CYCLES = (0, 1, 2, 4, 8, 16)  # oversampling code -> conversions


def _s8(v):
    return v - 256 if v > 127 else v


def _s16(v):
    return v - 65536 if v > 32767 else v


class BME688:
    def __init__(self, i2c, addr=0x77, osrs_t=2, osrs_p=1, osrs_h=1,
                 heater_temp=320, heater_ms=150, amb_temp=25):
        """addr 0x77 = SDO high (Adafruit default), 0x76 = SDO low.
        osrs codes: 0=skip, 1=x1, 2=x2, 3=x4, 4=x8, 5=x16.
        heater_temp in degC (200-400 typical), heater_ms 1-4032 ms (0 = gas off)."""
        self.i2c = i2c
        self.addr = addr
        cid = self._r(REG_CHIP_ID, 1)[0]
        if cid != CHIP_ID:
            raise OSError("BME688 not found at 0x%02X (chip id 0x%02X)" % (addr, cid))
        self._w(REG_RESET, 0xB6)
        time.sleep_ms(10)  # power-on/soft-reset start-up time 2 ms max
        self.variant = self._r(REG_VARIANT_ID, 1)[0]
        if self.variant != VARIANT_BME688:
            raise OSError("variant id 0x%02X: this is not a BME688 (a BME680 reads 0x00)" % self.variant)
        self._load_calib()
        self.osrs_t = osrs_t & 7
        self.osrs_p = osrs_p & 7
        self.osrs_h = osrs_h & 7
        self.heater_ms = heater_ms
        self.gas_on = False
        self.t_fine = 0.0
        # Sleep mode while configuring; IIR filter off.
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2))
        self._w(REG_CONFIG, 0x00)
        self._w(REG_CTRL_HUM, self.osrs_h)
        self.set_heater(heater_temp, heater_ms, amb_temp)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _load_calib(self):
        c = self._r(0x8A, 23)   # 0x8A..0xA0
        e = self._r(0xE1, 14)   # 0xE1..0xEE
        g = lambda reg: c[reg - 0x8A]
        h = lambda reg: e[reg - 0xE1]
        self.T1 = h(0xE9) | (h(0xEA) << 8)
        self.T2 = _s16(g(0x8A) | (g(0x8B) << 8))
        self.T3 = _s8(g(0x8C))
        self.P1 = g(0x8E) | (g(0x8F) << 8)
        self.P2 = _s16(g(0x90) | (g(0x91) << 8))
        self.P3 = _s8(g(0x92))
        self.P4 = _s16(g(0x94) | (g(0x95) << 8))
        self.P5 = _s16(g(0x96) | (g(0x97) << 8))
        self.P6 = _s8(g(0x99))
        self.P7 = _s8(g(0x98))
        self.P8 = _s16(g(0x9C) | (g(0x9D) << 8))
        self.P9 = _s16(g(0x9E) | (g(0x9F) << 8))
        self.P10 = g(0xA0)
        self.H1 = (h(0xE3) << 4) | (h(0xE2) & 0x0F)
        self.H2 = (h(0xE1) << 4) | (h(0xE2) >> 4)
        self.H3 = _s8(h(0xE4))
        self.H4 = _s8(h(0xE5))
        self.H5 = _s8(h(0xE6))
        self.H6 = h(0xE7)
        self.H7 = _s8(h(0xE8))
        self.G1 = _s8(h(0xED))
        self.G2 = _s16(h(0xEB) | (h(0xEC) << 8))
        self.G3 = _s8(h(0xEE))
        self.res_heat_val = _s8(self._r(REG_RES_HEAT_VAL, 1)[0])
        self.res_heat_range = (self._r(REG_RES_HEAT_RANGE, 1)[0] >> 4) & 0x03

    def _res_heat(self, target, amb):
        # Sec. 3.6.5 floating point
        target = min(target, 400)
        var1 = self.G1 / 16.0 + 49.0
        var2 = (self.G2 / 32768.0) * 0.0005 + 0.00235
        var3 = self.G3 / 1024.0
        var4 = var1 * (1.0 + var2 * target)
        var5 = var4 + var3 * amb
        r = int(3.4 * ((var5 * (4.0 / (4.0 + self.res_heat_range)) *
                        (1.0 / (1.0 + self.res_heat_val * 0.002))) - 25))
        return max(0, min(255, r))

    @staticmethod
    def _gas_wait(ms):
        # Sec. 5.3.4.3: 6-bit value (1 ms steps) x multiplier 1/4/16/64 in bits 7:6
        if ms >= 0xFC0:
            return 0xFF
        f = 0
        while ms > 0x3F:
            ms //= 4
            f += 1
        return ms + f * 64

    def set_heater(self, temp_c, ms, amb_temp=25):
        """Heater step 0: hot plate temperature (degC) and time (ms); temp_c=0 turns gas off."""
        self.heater_ms = ms
        if not temp_c or not ms:
            self._w(REG_CTRL_GAS_1, 0x00)  # run_gas = 0
            self._w(REG_CTRL_GAS_0, 0x08)  # heat_off
            self.gas_on = False
            return
        self._w(REG_RES_HEAT_0, self._res_heat(temp_c, amb_temp))
        self._w(REG_GAS_WAIT_0, self._gas_wait(ms))
        self._w(REG_CTRL_GAS_0, 0x00)
        self._w(REG_CTRL_GAS_1, 0x20 | 0x00)  # run_gas<5> = 1, nb_conv = 0 (heater step 0)
        self.gas_on = True

    def _meas_ms(self):
        # Bosch BME68x sensor API duration estimate (forced mode): 1963 us per conversion,
        # TPH switching 4 x 477 us, gas measurement 5 x 477 us, 1 ms wake-up, plus the heater time.
        cyc = _OS_CYCLES[min(self.osrs_t, 5)] + _OS_CYCLES[min(self.osrs_p, 5)] + _OS_CYCLES[min(self.osrs_h, 5)]
        us = cyc * 1963 + 477 * 4 + 477 * 5 + 1000
        return us // 1000 + 1 + (self.heater_ms if self.gas_on else 0)

    def _comp_t(self, adc):
        var1 = (adc / 16384.0 - self.T1 / 1024.0) * self.T2
        var2 = ((adc / 131072.0 - self.T1 / 8192.0) * (adc / 131072.0 - self.T1 / 8192.0)) * (self.T3 * 16.0)
        self.t_fine = var1 + var2
        return self.t_fine / 5120.0

    def _comp_p(self, adc):
        var1 = self.t_fine / 2.0 - 64000.0
        var2 = var1 * var1 * (self.P6 / 131072.0)
        var2 = var2 + var1 * self.P5 * 2.0
        var2 = var2 / 4.0 + self.P4 * 65536.0
        var1 = ((self.P3 * var1 * var1) / 16384.0 + self.P2 * var1) / 524288.0
        var1 = (1.0 + var1 / 32768.0) * self.P1
        if var1 == 0:
            return 0.0
        p = 1048576.0 - adc
        p = ((p - var2 / 4096.0) * 6250.0) / var1
        var1 = (self.P9 * p * p) / 2147483648.0
        var2 = p * (self.P8 / 32768.0)
        var3 = (p / 256.0) * (p / 256.0) * (p / 256.0) * (self.P10 / 131072.0)
        return p + (var1 + var2 + var3 + self.P7 * 128.0) / 16.0  # Pa

    def _comp_h(self, adc, temp_c):
        var1 = adc - (self.H1 * 16.0 + (self.H3 / 2.0) * temp_c)
        var2 = var1 * ((self.H2 / 262144.0) * (1.0 + (self.H4 / 16384.0) * temp_c +
                                               (self.H5 / 1048576.0) * temp_c * temp_c))
        var3 = self.H6 / 16384.0
        var4 = self.H7 / 2097152.0
        h = var2 + (var3 + var4 * temp_c) * var2 * var2
        return 100.0 if h > 100.0 else (0.0 if h < 0.0 else h)

    @staticmethod
    def _comp_gas(adc, rng):
        # Sec. 3.7 (BME688): ohms
        var1 = 262144 >> rng
        var2 = 4096 + (adc - 512) * 3
        return 1000000.0 * var1 / var2

    def read(self):
        """One forced-mode measurement. Returns (temp degC, pressure Pa, humidity %RH, gas ohms or None).
        Gas is None when gas is off or the heater did not reach its set-point (heat_stab_r = 0)."""
        self._w(REG_CTRL_HUM, self.osrs_h)
        self._w(REG_CTRL_MEAS, (self.osrs_t << 5) | (self.osrs_p << 2) | 0x01)  # forced mode
        time.sleep_ms(self._meas_ms())
        for _ in range(50):
            d = self._r(REG_FIELD0, 17)
            if d[0] & 0x80:  # new_data_0
                break
            time.sleep_ms(5)
        else:
            raise OSError("BME688: no new data")
        adc_p = (d[2] << 12) | (d[3] << 4) | (d[4] >> 4)
        adc_t = (d[5] << 12) | (d[6] << 4) | (d[7] >> 4)
        adc_h = (d[8] << 8) | d[9]
        adc_g = (d[15] << 2) | (d[16] >> 6)   # gas_r<9:2> in 0x2C, gas_r<1:0> in 0x2D<7:6>
        g_range = d[16] & 0x0F
        t = self._comp_t(adc_t)
        p = self._comp_p(adc_p)
        h = self._comp_h(adc_h, t)
        gas = None
        if self.gas_on and (d[16] & 0x20) and (d[16] & 0x10):  # gas_valid_r and heat_stab_r
            gas = self._comp_gas(adc_g, g_range)
        return t, p, h, gas

    def altitude(self, sea_level_hpa=1013.25):
        p = self.read()[1] / 100.0
        return 44330.0 * (1.0 - (p / sea_level_hpa) ** (1 / 5.255))
