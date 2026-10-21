# AK09918 3-axis magnetometer (AKM AK09918C datasheet 016014242-E-00), MicroPython driver.
# I2C address 0x0C. WIA1 (0x00) = 0x48 (AKM), WIA2 (0x01) = 0x0C (AK09918).
# Mode in CNTL2 (0x31): 0x00 power-down, 0x01 single, 0x02/0x04/0x06/0x08 continuous 10/20/50/100 Hz,
# 0x10 self-test. Always go through power-down and wait >= 100 us (Twait) before a new mode.
# Read: poll ST1 (0x10) DRDY bit 0, read HXL..HZH (0x11-0x16, 16-bit two's complement, little endian),
# then ST2 (0x18) must be read to end the read (HOFL bit 3 = overflow). 0.15 uT per LSB.
import time

_WIA1 = 0x00
_WIA2 = 0x01
_ST1 = 0x10
_HXL = 0x11
_ST2 = 0x18
_CNTL2 = 0x31
_CNTL3 = 0x32

MODE_POWER_DOWN = 0x00
MODE_SINGLE = 0x01
MODE_10HZ = 0x02
MODE_20HZ = 0x04
MODE_50HZ = 0x06
MODE_100HZ = 0x08
MODE_SELF_TEST = 0x10

UT_PER_LSB = 0.15


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


class AK09918:
    def __init__(self, i2c, addr=0x0C, mode=MODE_SINGLE):
        self.i2c = i2c
        self.addr = addr
        self.overflow = False
        self.overrun = False
        wia = self.i2c.readfrom_mem(addr, _WIA1, 2)
        if wia[0] != 0x48 or wia[1] != 0x0C:
            raise OSError('AK09918 not found at 0x%02X (WIA %02X %02X)' % (addr, wia[0], wia[1]))
        self._write(_CNTL3, 0x01)  # soft reset: registers to defaults, power-down mode
        time.sleep_ms(1)
        self.set_mode(mode)

    def _write(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def set_mode(self, mode):
        """Select an operating mode (passes through power-down first, per datasheet 9.3)."""
        self._write(_CNTL2, MODE_POWER_DOWN)
        time.sleep_us(100)  # Twait
        self.mode = mode
        if mode != MODE_SINGLE and mode != MODE_POWER_DOWN:
            self._write(_CNTL2, mode)

    def read_raw(self, timeout_ms=100):
        """Return raw (x, y, z) counts. In single mode this triggers one measurement (7.2-8.2 ms)."""
        if self.mode == MODE_SINGLE:
            self._write(_CNTL2, MODE_SINGLE)
            time.sleep_ms(9)
        t0 = time.ticks_ms()
        while True:
            st1 = self.i2c.readfrom_mem(self.addr, _ST1, 1)[0]
            if st1 & 0x01:
                break
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('AK09918: data not ready')
            time.sleep_ms(1)
        self.overrun = bool(st1 & 0x02)
        # HXL..HZH, TMPS, ST2 in one burst: reading ST2 releases the data protection.
        d = self.i2c.readfrom_mem(self.addr, _HXL, 8)
        self.overflow = bool(d[7] & 0x08)  # HOFL: |X|+|Y|+|Z| >= 4912 uT, data not valid
        return _s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5])

    def read(self):
        """Return the field (x, y, z) in microtesla."""
        x, y, z = self.read_raw()
        return x * UT_PER_LSB, y * UT_PER_LSB, z * UT_PER_LSB
