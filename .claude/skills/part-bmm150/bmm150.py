# BMM150 geomagnetic sensor (Bosch Sensortec), MicroPython driver.
# Register map and timings from the BMM150 datasheet (BST-BMM150-DS001); trim registers and the
# floating-point compensation are those of Bosch's BMM150 SensorAPI (bmm150.c), which the datasheet
# requires ("trimming data ... required for sensor data compensation, read out by the API").
import time

_CHIP_ID = 0x40      # reads 0x32 once the power control bit is set
_DATA_X_LSB = 0x42   # 0x42..0x49: X, Y, Z, RHALL (+ data-ready bit in 0x48)
_POWER = 0x4B        # bit0 = power control (suspend -> sleep)
_OPMODE = 0x4C       # [2:1] opmode: 00 normal, 01 forced, 11 sleep; [5:3] data rate
_REP_XY = 0x51       # nXY = 1 + 2 * REPXY
_REP_Z = 0x52        # nZ = 1 + REPZ

# Presets from datasheet table 3: (REPXY register, REPZ register, max forced-mode time in ms)
PRESETS = {
    'low_power': (0x01, 0x02, 4),       # nXY 3,  nZ 3
    'regular': (0x04, 0x0E, 11),        # nXY 9,  nZ 15
    'enhanced': (0x07, 0x1A, 17),       # nXY 15, nZ 27
    'high_accuracy': (0x17, 0x52, 50),  # nXY 47, nZ 83
}


def _s8(b):
    return b - 256 if b & 0x80 else b


def _s16(lo, hi):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class BMM150:
    def __init__(self, i2c, addr=0x13, preset='regular'):
        self.i2c = i2c
        self.addr = addr
        self._w(_POWER, 0x01)          # suspend -> sleep
        time.sleep_ms(3)               # start-up time from suspend: 3 ms
        cid = self._r(_CHIP_ID, 1)[0]
        if cid != 0x32:
            raise OSError('BMM150 not found (chip id 0x%02x)' % cid)
        self._read_trim()
        self.set_preset(preset)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _read_trim(self):
        a = self._r(0x5D, 2)    # dig_x1, dig_y1
        b = self._r(0x62, 4)    # dig_z4 (LSB, MSB), dig_x2, dig_y2
        c = self._r(0x68, 10)   # dig_z2, dig_z1, dig_xyz1, dig_z3 (LSB, MSB each), dig_xy2, dig_xy1
        self.x1 = _s8(a[0])
        self.y1 = _s8(a[1])
        self.z4 = _s16(b[0], b[1])
        self.x2 = _s8(b[2])
        self.y2 = _s8(b[3])
        self.z2 = _s16(c[0], c[1])
        self.z1 = (c[3] << 8) | c[2]
        self.xyz1 = ((c[5] & 0x7F) << 8) | c[4]
        self.z3 = _s16(c[6], c[7])
        self.xy2 = _s8(c[8])
        self.xy1 = c[9]

    def set_preset(self, preset):
        rxy, rz, self._t_ms = PRESETS[preset]
        self._w(_REP_XY, rxy)
        self._w(_REP_Z, rz)

    def _measure(self):
        # Forced mode: one measurement, then the chip returns to sleep by itself.
        self._w(_OPMODE, 0x02)
        time.sleep_ms(self._t_ms)
        for _ in range(20):
            if self._r(0x48, 1)[0] & 0x01:   # data-ready status
                break
            time.sleep_ms(2)
        else:
            raise OSError('BMM150 measurement timed out')
        return self._r(_DATA_X_LSB, 8)

    def _comp_xy(self, raw, rhall, d1, d2):
        if raw == -4096 or rhall == 0 or self.xyz1 == 0:
            return None   # overflow
        r = self.xyz1 * 16384.0 / rhall - 16384.0
        p2 = self.xy2 * (r * r / 268435456.0) + r * self.xy1 / 16384.0
        p4 = raw * ((p2 + 256.0) * (d2 + 160.0))
        return (p4 / 8192.0 + d1 * 8.0) / 16.0

    def _comp_z(self, raw, rhall):
        if raw == -16384 or self.z2 == 0 or self.z1 == 0 or self.xyz1 == 0 or rhall == 0:
            return None   # overflow
        p0 = raw - self.z4
        p2 = self.z3 * (rhall - self.xyz1)
        p4 = self.z2 + self.z1 * rhall / 32768.0
        return ((p0 * 131072.0 - p2) / (p4 * 4.0)) / 16.0

    def read_raw(self):
        """Return raw (x, y, z, rhall) ADC values from one forced measurement."""
        d = self._measure()
        x = _s16(d[0], d[1]) >> 3        # 13-bit two's complement
        y = _s16(d[2], d[3]) >> 3
        z = _s16(d[4], d[5]) >> 1        # 15-bit two's complement
        rhall = (d[7] << 6) | (d[6] >> 2)  # 14-bit hall resistance
        return x, y, z, rhall

    def read(self):
        """Measure once; return compensated (x, y, z) in microtesla (None for an axis that overflowed)."""
        x, y, z, rh = self.read_raw()
        return (self._comp_xy(x, rh, self.x1, self.x2),
                self._comp_xy(y, rh, self.y1, self.y2),
                self._comp_z(z, rh))
