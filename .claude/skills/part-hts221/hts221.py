# HTS221 relative humidity & temperature sensor (STMicroelectronics), MicroPython driver for I2C.
# From the HTS221 datasheet (DocID026333 Rev 5):
#   I2C address 0x5F, WHO_AM_I 0x0F = 0xBC.
#   CTRL_REG1 0x20: PD bit 7 (1 = active), BDU bit 2, ODR[1:0] (01 = 1 Hz).
#   STATUS_REG 0x27: H_DA bit 1, T_DA bit 0.
#   HUMIDITY_OUT 0x28/0x29, TEMP_OUT 0x2A/0x2B: signed 16-bit, low byte first.
#   CALIB 0x30..0x3F: per-chip calibration points; values are found by linear interpolation.
#   Setting bit 7 of the register address (e.g. 0x28 | 0x80) auto-increments for multi-byte reads.
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x20
_STATUS_REG = 0x27
_HUMIDITY_OUT_L = 0x28
_CALIB_0 = 0x30
_AUTO_INC = 0x80


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class HTS221:
    def __init__(self, i2c, addr=0x5F):
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0xBC:
            raise OSError('HTS221 not found (WHO_AM_I 0x%02X, expected 0xBC): check wiring' % who)
        # Read the 16 factory calibration bytes (Table 19) in one auto-increment burst.
        c = self.i2c.readfrom_mem(addr, _CALIB_0 | _AUTO_INC, 16)
        self._h0 = c[0] / 2                                   # H0_rH_x2 / 2  (% rH)
        self._h1 = c[1] / 2                                   # H1_rH_x2 / 2
        self._t0 = (((c[5] & 0x03) << 8) | c[2]) / 8          # T0_degC_x8 (10 bits) / 8  (deg C)
        self._t1 = (((c[5] & 0x0C) << 6) | c[3]) / 8          # T1_degC_x8 (10 bits) / 8
        self._h0_out = _s16(c[6], c[7])                       # H0_T0_OUT (0x36/0x37)
        self._h1_out = _s16(c[10], c[11])                     # H1_T0_OUT (0x3A/0x3B)
        self._t0_out = _s16(c[12], c[13])                     # T0_OUT (0x3C/0x3D)
        self._t1_out = _s16(c[14], c[15])                     # T1_OUT (0x3E/0x3F)
        if self._h1_out == self._h0_out or self._t1_out == self._t0_out:
            raise OSError('HTS221 calibration data invalid')
        # Power on, block data update, 1 Hz continuous conversion.
        self.i2c.writeto_mem(addr, _CTRL_REG1, bytes([0x80 | 0x04 | 0x01]))
        self._wait_ready(1500)  # first sample arrives within one 1 Hz period

    def _wait_ready(self, timeout_ms):
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
            if self.i2c.readfrom_mem(self.addr, _STATUS_REG, 1)[0] & 0x03 == 0x03:
                return True
            time.sleep_ms(20)
        return False

    def raw(self):
        """(H_OUT, T_OUT) signed 16-bit counts, read in one 4-byte burst from 0x28."""
        d = self.i2c.readfrom_mem(self.addr, _HUMIDITY_OUT_L | _AUTO_INC, 4)
        return _s16(d[0], d[1]), _s16(d[2], d[3])

    def read(self):
        """Return (temperature in deg C, relative humidity in %)."""
        h_out, t_out = self.raw()
        t = self._t0 + (t_out - self._t0_out) * (self._t1 - self._t0) / (self._t1_out - self._t0_out)
        h = self._h0 + (h_out - self._h0_out) * (self._h1 - self._h0) / (self._h1_out - self._h0_out)
        h = min(100.0, max(0.0, h))  # datasheet: values outside 0-100 % rH must be clipped by software
        return t, h

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
