# MMC5603NJ 3-axis AMR magnetometer (MEMSIC datasheet Rev. B, 1/17/2022), MicroPython driver.
# One-shot measurement as in the datasheet's "Example of measurement": write 0x21 (Take_meas_M +
# Auto_SR_en) to Internal Control 0 (0x1B), poll Status1 (0x18) bit 6 Meas_m_done, then read
# 0x00..0x08. Each axis is a 20-bit UNSIGNED value: out[19:12] in 0x00/02/04, out[11:4] in
# 0x01/03/05, out[3:0] in bits 7..4 of 0x06/07/08. Null field = 524288 counts, 16384 counts/G.
# Temperature: Take_meas_T (0x02), poll bit 7 Meas_t_done, T = -75 + 0.8 * Tout (0x09) degrees C.
import time

_REG_XOUT0 = 0x00
_REG_TOUT = 0x09
_REG_STATUS1 = 0x18
_REG_ODR = 0x1A
_REG_CTRL0 = 0x1B
_REG_CTRL1 = 0x1C
_REG_CTRL2 = 0x1D
_REG_PRODUCT_ID = 0x39

_PRODUCT_ID = 0x10

_TM_M = 0x01
_TM_T = 0x02
_DO_SET = 0x08
_DO_RESET = 0x10
_AUTO_SR_EN = 0x20
_SW_RESET = 0x80

_MEAS_M_DONE = 0x40
_MEAS_T_DONE = 0x80

_NULL_FIELD = 524288  # 20-bit null-field output
_COUNTS_PER_GAUSS = 16384.0  # 20-bit operation

# Bandwidth (Internal Control 1 bits 1..0): measurement time 6.6 / 3.5 / 2.0 / 1.2 ms.
BW_6_6MS = 0
BW_3_5MS = 1
BW_2_0MS = 2
BW_1_2MS = 3


class MMC5603:
    def __init__(self, i2c, addr=0x30, bw=BW_6_6MS):
        self.i2c = i2c
        self.addr = addr
        pid = self._read(_REG_PRODUCT_ID, 1)[0]
        if pid != _PRODUCT_ID:
            raise OSError('MMC5603: product ID 0x%02X, expected 0x10 (check wiring / address 0x30)' % pid)
        self._write(_REG_CTRL1, _SW_RESET)
        time.sleep_ms(20)  # power-on time after a software reset is 20 ms
        self._write(_REG_CTRL1, bw & 0x03)
        self.set_reset()

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def set_reset(self):
        """SET then RESET pulse to clear any magnetisation left by a strong field (>32 G)."""
        self._write(_REG_CTRL0, _DO_SET)
        time.sleep_ms(1)  # tSR >= 1 ms
        self._write(_REG_CTRL0, _DO_RESET)
        time.sleep_ms(1)

    def _wait(self, mask, timeout_ms):
        t0 = time.ticks_ms()
        while not (self._read(_REG_STATUS1, 1)[0] & mask):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('MMC5603: measurement timed out')
            time.sleep_ms(1)

    def read_raw(self):
        """Take one measurement and return the signed 20-bit counts (x, y, z), null field removed."""
        self._write(_REG_CTRL0, _TM_M | _AUTO_SR_EN)
        self._wait(_MEAS_M_DONE, 50)
        d = self._read(_REG_XOUT0, 9)
        x = (d[0] << 12) | (d[1] << 4) | (d[6] >> 4)
        y = (d[2] << 12) | (d[3] << 4) | (d[7] >> 4)
        z = (d[4] << 12) | (d[5] << 4) | (d[8] >> 4)
        return x - _NULL_FIELD, y - _NULL_FIELD, z - _NULL_FIELD

    def read(self):
        """Return the magnetic field (x, y, z) in gauss (1 G = 100 uT)."""
        x, y, z = self.read_raw()
        k = _COUNTS_PER_GAUSS
        return x / k, y / k, z / k

    def temperature(self):
        """Die temperature in degrees C (about 0.8 C per count, -75 to 125 C)."""
        self._write(_REG_CTRL0, _TM_T)
        self._wait(_MEAS_T_DONE, 50)
        return -75 + 0.8 * self._read(_REG_TOUT, 1)[0]
