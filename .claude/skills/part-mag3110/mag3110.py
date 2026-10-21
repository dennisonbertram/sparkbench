# MAG3110 3-axis digital magnetometer (NXP/Freescale), MicroPython driver for I2C.
# From the MAG3110 datasheet (Rev. 9.2):
#   I2C address 0x0E. DR_STATUS 0x00 (bit 3 ZYXDR = new X/Y/Z set ready),
#   OUT_X_MSB..OUT_Z_LSB 0x01-0x06: signed 16-bit two's complement, MSB first, 0.1 uT/LSB,
#   WHO_AM_I 0x07 = 0xC4, DIE_TEMP 0x0F: signed 8-bit, 1 degC/LSB (offset NOT factory trimmed),
#   CTRL_REG1 0x10: DR[2:0] bits 7:5, OS[1:0] bits 4:3, FR bit 2, TM bit 1, AC bit 0,
#   CTRL_REG2 0x11: AUTO_MRST_EN bit 7, RAW bit 5, Mag_RST bit 4.
# CTRL_REG1 fields other than AC/TM can only be changed in STANDBY (AC = 0).
# Burst-read from 0x01: the data registers are only refreshed when OUT_X_MSB is read first.
import time
import math

_DR_STATUS = 0x00
_OUT_X_MSB = 0x01
_WHO_AM_I = 0x07
_DIE_TEMP = 0x0F
_CTRL_REG1 = 0x10
_CTRL_REG2 = 0x11

# Output data rate in Hz for each (DR, OS) pair, datasheet Table 32: ODR = 1280 / 16 / 2^(DR) / 2^(OS),
# except DR = 4..7 where the ADC rate stays at 80 Hz.
_ADC = (1280, 640, 320, 160, 80, 80, 80, 80)
_DIV = (1, 1, 1, 1, 1, 2, 4, 8)


class MAG3110:
    def __init__(self, i2c, addr=0x0E, dr=0, os=3):
        """dr: CTRL_REG1 DR[2:0] (0..7), os: OS[1:0] over-sampling (0..3 = 16/32/64/128 samples).
        Default dr=0, os=3: 10 Hz output, 128x over-sampling, lowest noise (0.25 uT rms)."""
        if not 0 <= dr <= 7 or not 0 <= os <= 3:
            raise ValueError('dr must be 0..7 and os 0..3')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0xC4:
            raise OSError('MAG3110 not found (WHO_AM_I 0x%02X, expected 0xC4): check wiring and address' % who)
        self.odr = _ADC[dr] / 16 / _DIV[dr] / (1 << os)
        self._w(_CTRL_REG1, 0x00)                          # STANDBY before changing settings
        self._w(_CTRL_REG2, 0xA0)                          # AUTO_MRST_EN + RAW (offsets done in software)
        self._w(_CTRL_REG1, (dr << 5) | (os << 3) | 0x01)  # data rate, over-sampling, ACTIVE
        self.offset = [0.0, 0.0, 0.0]                      # hard-iron offset in uT, see calibrate()

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when a new X/Y/Z set is ready (DR_STATUS bit 3, ZYXDR)."""
        return bool(self.i2c.readfrom_mem(self.addr, _DR_STATUS, 1)[0] & 0x08)

    def raw(self):
        """(x, y, z) signed counts (0.1 uT each). Waits for a fresh sample, then reads 0x01-0x06 in one burst."""
        t0 = time.ticks_ms()
        timeout = int(2500 / self.odr) + 50
        while not self.data_ready():
            if time.ticks_diff(time.ticks_ms(), t0) > timeout:
                raise OSError('MAG3110: no new data (is it in ACTIVE mode?)')
            time.sleep_ms(2)
        d = self.i2c.readfrom_mem(self.addr, _OUT_X_MSB, 6)
        out = []
        for i in (0, 2, 4):
            v = (d[i] << 8) | d[i + 1]
            if v & 0x8000:
                v -= 65536
            out.append(v)
        return tuple(out)

    def read(self):
        """(x, y, z) magnetic field in microtesla (0.1 uT/LSB), minus any calibration offset."""
        x, y, z = self.raw()
        o = self.offset
        return x * 0.1 - o[0], y * 0.1 - o[1], z * 0.1 - o[2]

    def temperature(self):
        """Die temperature in degC (1 degC/LSB). Its offset is not trimmed: calibrate against a thermometer."""
        t = self.i2c.readfrom_mem(self.addr, _DIE_TEMP, 1)[0]
        return t - 256 if t & 0x80 else t

    def heading(self):
        """Compass heading in degrees (0-360) from X and Y; only valid with the board held level."""
        x, y, _ = self.read()
        h = math.degrees(math.atan2(y, x))
        return h + 360 if h < 0 else h

    def calibrate(self, seconds=10):
        """Turn the board slowly through every direction; stores the hard-iron offset (centre of min/max)."""
        lo = [1e9] * 3
        hi = [-1e9] * 3
        self.offset = [0.0, 0.0, 0.0]
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < seconds * 1000:
            v = self.read()
            for i in range(3):
                lo[i] = min(lo[i], v[i])
                hi[i] = max(hi[i], v[i])
        self.offset = [(lo[i] + hi[i]) / 2 for i in range(3)]
        return self.offset
