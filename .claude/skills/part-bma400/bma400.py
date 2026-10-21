# BMA400 ultra-low-power 3-axis accelerometer (Bosch Sensortec), MicroPython driver for I2C.
# From the BMA400 data sheet BST-BMA400-DS000 (rev 2.3):
#   CHIPID 0x00 = 0x90.
#   STATUS 0x03: bit 7 drdy_stat (new data, cleared by reading the data), bit 4 cmd_rdy,
#     bits 2:1 power_mode_stat (0 sleep, 1 low power, 2 normal).
#   ACC_X_LSB..ACC_Z_MSB 0x04-0x09: 12-bit two's complement per axis,
#     acc = LSB + 256 * (MSB & 0x0F); if acc > 2047: acc -= 4096.
#     All six bytes must be read in ONE burst (the registers are locked during the read).
#   TEMP_DATA 0x11: signed 8-bit, T = temp_data * 0.5 + 23.0 degC (updated every 160 ms).
#   ACC_CONFIG0 0x19: bits 1:0 power_mode_conf (0 sleep, 1 low power, 2 normal).
#   ACC_CONFIG1 0x1A: bits 7:6 acc_range (2/4/8/16 g), bits 5:4 osr, bits 3:0 acc_odr (0x08 = 100 Hz).
#   ACC_CONFIG2 0x1B: bits 3:2 data_src_reg (0 = acc_filt1 at the ACC_CONFIG1 ODR).
#   CMD 0x7E: 0xB6 = soft reset.
#   Sensitivity: 1024 / 512 / 256 / 128 LSB per g at +-2 / 4 / 8 / 16 g.
#   After power-up / reset the chip is in sleep mode (no conversions); wake-up time to normal mode is 2/ODR.
import time

_CHIPID = 0x00
_STATUS = 0x03
_ACC_X_LSB = 0x04
_TEMP_DATA = 0x11
_ACC_CONFIG0 = 0x19
_ACC_CONFIG1 = 0x1A
_ACC_CONFIG2 = 0x1B
_CMD = 0x7E

_RANGE = {2: (0b00, 1024), 4: (0b01, 512), 8: (0b10, 256), 16: (0b11, 128)}


class BMA400:
    def __init__(self, i2c, addr=0x14, g_range=2):
        """addr: 0x14 with SDO to GND (SparkFun board default), 0x15 with SDO to 3.3 V.
        g_range: 2, 4, 8 or 16 g full scale."""
        if g_range not in _RANGE:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(2)  # power-up time ts_up is at most 1 ms
        cid = self._r(_CHIPID, 1)[0]
        if cid != 0x90:
            raise OSError('BMA400 not found (CHIPID 0x%02X, expected 0x90): check wiring/address' % cid)
        self._w(_CMD, 0xB6)  # soft reset: all settings back to their defaults, chip in sleep mode
        time.sleep_ms(5)
        if self._r(_CHIPID, 1)[0] != 0x90:
            raise OSError('BMA400 did not answer after soft reset')
        bits, self._lsb_per_g = _RANGE[g_range]
        # range, osr = 3 (lowest noise), acc_odr = 0x08 (100 Hz)
        self._w(_ACC_CONFIG1, (bits << 6) | (0b11 << 4) | 0x08)
        self._w(_ACC_CONFIG2, 0x00)  # data registers fed from acc_filt1 (the ODR above)
        self._w(_ACC_CONFIG0, 0x02)  # normal mode, filt1 bandwidth 0.48 x ODR
        time.sleep_ms(30)  # wake-up time 2/ODR = 20 ms at 100 Hz, with margin
        for _ in range(20):
            if (self._r(_STATUS, 1)[0] >> 1) & 0x03 == 0x02:
                break
            time.sleep_ms(2)
        else:
            raise OSError('BMA400 did not enter normal mode')

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def data_ready(self):
        """True when STATUS.drdy_stat says a new X/Y/Z sample is available."""
        return bool(self._r(_STATUS, 1)[0] & 0x80)

    def raw(self):
        """(x, y, z) 12-bit counts, read in one 6-byte burst from ACC_X_LSB."""
        for _ in range(25):  # wait up to ~25 ms (over two samples at 100 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self._r(_ACC_X_LSB, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] + 256 * (d[i + 1] & 0x0F)
            if v > 2047:
                v -= 4096
            out.append(v)
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._lsb_per_g
        x, y, z = self.raw()
        return x / k, y / k, z / k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())

    def temperature(self):
        """Die temperature in degC (8-bit, 0.5 degC steps, updated every 160 ms)."""
        t = self._r(_TEMP_DATA, 1)[0]
        if t > 127:
            t -= 256
        return t * 0.5 + 23.0
