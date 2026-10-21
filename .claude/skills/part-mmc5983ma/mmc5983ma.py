# MMC5983MA 3-axis AMR magnetometer (MEMSIC datasheet Rev A, 4/3/2019), MicroPython driver, I2C.
# One-shot measurement as in the datasheet's "Example measurement": write TM_M (0x01) to
# Internal Control 0 (0x09), poll Status (0x08) bit 0 Meas_M_Done, then read 0x00..0x06.
# Each axis is an 18-bit UNSIGNED value: out[17:10] in 0x00/02/04, out[9:2] in 0x01/03/05,
# out[1:0] in 0x06 (X bits 7..6, Y bits 5..4, Z bits 3..2). Null field = 131072 counts,
# 16384 counts/G (16-bit mode: 32768 and 4096). Range +-8 G.
# Temperature: TM_T (0x02) to 0x09, poll bit 1 Meas_T_Done, T = -75 + 0.8 * Tout (0x07) degrees C.
import time

_REG_XOUT0 = 0x00
_REG_TOUT = 0x07
_REG_STATUS = 0x08
_REG_CTRL0 = 0x09
_REG_CTRL1 = 0x0A
_REG_CTRL2 = 0x0B
_REG_PRODUCT_ID = 0x2F

_PRODUCT_ID = 0x30

# Internal Control 0 bits
_TM_M = 0x01
_TM_T = 0x02
_DO_SET = 0x08
_DO_RESET = 0x10
# Internal Control 1 bits
_SW_RST = 0x80

# Status bits
_MEAS_M_DONE = 0x01
_MEAS_T_DONE = 0x02

_NULL_FIELD = 131072  # 18-bit null-field output
_COUNTS_PER_GAUSS = 16384.0  # 18-bit operation

# Bandwidth (Internal Control 1 bits 1..0): measurement time 8 / 4 / 2 / 0.5 ms.
BW_8MS = 0
BW_4MS = 1
BW_2MS = 2
BW_0_5MS = 3
_MEAS_TIMEOUT_MS = 50


class MMC5983MA:
    def __init__(self, i2c, addr=0x30, bw=BW_8MS):
        self.i2c = i2c
        self.addr = addr
        self._write(_REG_CTRL1, _SW_RST)
        time.sleep_ms(15)  # power-on time after SW_RST is 10 ms
        pid = self._read(_REG_PRODUCT_ID, 1)[0]
        if pid != _PRODUCT_ID:
            raise OSError('MMC5983MA: product ID 0x%02X, expected 0x30 (check wiring / address 0x30)' % pid)
        self._write(_REG_CTRL1, bw & 0x03)
        self._write(_REG_CTRL2, 0x00)  # continuous mode off: one-shot measurements
        self.set_reset()

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def set_reset(self):
        """SET then RESET pulse to clear magnetisation left by a strong field (>10 G)."""
        self._write(_REG_CTRL0, _DO_SET)
        time.sleep_ms(1)  # the SET current pulse lasts 500 ns; 1 ms is ample
        self._write(_REG_CTRL0, _DO_RESET)
        time.sleep_ms(1)

    def _wait(self, mask):
        t0 = time.ticks_ms()
        while not (self._read(_REG_STATUS, 1)[0] & mask):
            if time.ticks_diff(time.ticks_ms(), t0) > _MEAS_TIMEOUT_MS:
                raise OSError('MMC5983MA: measurement timed out')
            time.sleep_ms(1)

    def read_raw(self):
        """Take one measurement after a SET pulse; return signed 18-bit counts (x, y, z), null field removed."""
        self._write(_REG_CTRL0, _DO_SET)  # datasheet: SET, then MEASUREMENT
        time.sleep_ms(1)
        self._write(_REG_CTRL0, _TM_M)
        self._wait(_MEAS_M_DONE)
        d = self._read(_REG_XOUT0, 7)
        x = (d[0] << 10) | (d[1] << 2) | ((d[6] >> 6) & 0x03)
        y = (d[2] << 10) | (d[3] << 2) | ((d[6] >> 4) & 0x03)
        z = (d[4] << 10) | (d[5] << 2) | ((d[6] >> 2) & 0x03)
        return x - _NULL_FIELD, y - _NULL_FIELD, z - _NULL_FIELD

    def read(self):
        """Return the magnetic field (x, y, z) in gauss (1 G = 100 uT)."""
        x, y, z = self.read_raw()
        k = _COUNTS_PER_GAUSS
        return x / k, y / k, z / k

    def temperature(self):
        """Die temperature in degrees C (about 0.8 C per count, -75 to 125 C)."""
        self._write(_REG_CTRL0, _TM_T)
        self._wait(_MEAS_T_DONE)
        return -75 + 0.8 * self._read(_REG_TOUT, 1)[0]
