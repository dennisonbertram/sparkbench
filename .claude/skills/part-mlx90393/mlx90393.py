# MLX90393 3-axis magnetometer (Melexis Triaxis Magnetic Node), MicroPython driver.
# Written from the Melexis MLX90393 datasheet (rev 012):
#  - every command is answered by a status byte; bit 4 (ERROR) set = command rejected
#  - EX 0x80, RT 0xF0, SM 0x3F (single measurement of T, X, Y, Z), RM 0x4F (read T, X, Y, Z)
#  - RR 0x50 <reg<<2> -> status, D15..D8, D7..D0 ; WR 0x60 <D15..D8> <D7..D0> <reg<<2> -> status
#  - sensitivity: Table 17 (HALLCONF = 0xC, TC off), temperature: 45.2 LSB/degC, 46244 LSB at 25 degC
import time

# Table 17, uT/LSB, HALLCONF = 0xC: _SENS[gain_sel][res] = (XY, Z)
_SENS = (
    ((0.751, 1.210), (1.502, 2.420), (3.004, 4.840), (6.009, 9.680)),
    ((0.601, 0.968), (1.202, 1.936), (2.403, 3.872), (4.840, 7.744)),
    ((0.451, 0.726), (0.901, 1.452), (1.803, 2.904), (3.605, 5.808)),
    ((0.376, 0.605), (0.751, 1.210), (1.502, 2.420), (3.004, 4.840)),
    ((0.300, 0.484), (0.601, 0.968), (1.202, 1.936), (2.403, 3.872)),
    ((0.250, 0.403), (0.501, 0.807), (1.001, 1.613), (2.003, 3.227)),
    ((0.200, 0.323), (0.401, 0.645), (0.801, 1.291), (1.602, 2.581)),
    ((0.150, 0.242), (0.300, 0.484), (0.601, 0.968), (1.202, 1.936)),
)

_ERROR = 0x10


class MLX90393:
    def __init__(self, i2c, addr=0x0C, gain=7, res=0, osr=0, dig_filt=5):
        """gain = GAIN_SEL 0..7 (7 = most sensitive), res = RES_XYZ 0..3 for all axes,
        osr / dig_filt per datasheet Table 19 (OSR=0 with DIG_FILT 0/1 and OSR=1 with
        DIG_FILT 0 are not permitted at HALLCONF = 0xC)."""
        if (osr == 0 and dig_filt < 2) or (osr == 1 and dig_filt == 0):
            raise ValueError('OSR/DIG_FILT combination not permitted with HALLCONF=0xC')
        self.i2c = i2c
        self.addr = addr
        self.gain, self.res, self.osr, self.dig_filt = gain, res, osr, dig_filt
        self._cmd(b'\x80')  # EX: leave any burst/WOC mode
        time.sleep_ms(1)
        self._cmd(b'\xF0', check=False)  # RT: warm reset (status shows RS)
        time.sleep_ms(2)  # datasheet: wait 1.5 ms after RT
        # Register 0x00: keep ANA_RESERVED_LOW/BIST/Z_SERIES, set GAIN_SEL and HALLCONF = 0xC
        r0 = self.read_reg(0x00)
        self.write_reg(0x00, (r0 & ~0x007F) | (gain << 4) | 0x0C)
        # Register 0x01: clear TCMP_EN (bit 10) so X/Y/Z use the uncompensated format of Table 21
        r1 = self.read_reg(0x01)
        self.write_reg(0x01, r1 & ~0x0400)
        # Register 0x02: OSR2 = 0, RES_Z = RES_Y = RES_X = res, DIG_FILT, OSR
        self.write_reg(0x02, (res << 9) | (res << 7) | (res << 5) | (dig_filt << 2) | osr)
        # Conversion time in single measurement mode (Section 12), +10 % oscillator margin
        tconvm = 67 + 64 * (1 << osr) * (2 + (1 << dig_filt))
        tconvt = 67 + 192
        us = 264 + 432 + 3 * tconvm + tconvt + 120
        self._wait_ms = us * 11 // 10000 + 1

    def _cmd(self, cmd, n=0, check=True):
        """Send a command and read the status byte (plus n data bytes)."""
        self.i2c.writeto(self.addr, cmd, False)  # repeated start, as in the datasheet figures
        d = self.i2c.readfrom(self.addr, 1 + n)
        if check and d[0] & _ERROR:
            raise OSError('MLX90393 rejected command 0x%02X (status 0x%02X)' % (cmd[0], d[0]))
        return d

    def read_reg(self, reg):
        d = self._cmd(bytes((0x50, reg << 2)), 2)
        return (d[1] << 8) | d[2]

    def write_reg(self, reg, value):
        self._cmd(bytes((0x60, (value >> 8) & 0xFF, value & 0xFF, reg << 2)))

    def read(self):
        """Single measurement. Returns (x, y, z) in microtesla and the chip temperature in degC."""
        self._cmd(b'\x3F')  # SM, zyxt = 1111
        time.sleep_ms(self._wait_ms)
        d = self._cmd(b'\x4F', 8)  # RM: status, T, X, Y, Z (MSB first)
        t_raw = (d[1] << 8) | d[2]
        raw = [(d[3] << 8) | d[4], (d[5] << 8) | d[6], (d[7] << 8) | d[8]]
        for i in range(3):
            if self.res == 0 or self.res == 1:
                if raw[i] & 0x8000:
                    raw[i] -= 0x10000  # two's complement
            elif self.res == 2:
                raw[i] -= 32768  # unsigned, 0 uT = 2^15
            else:
                raw[i] -= 16384  # unsigned, 0 uT = 2^14
        sxy, sz = _SENS[self.gain][self.res]
        temp = 25 + (t_raw - 46244) / 45.2
        return raw[0] * sxy, raw[1] * sxy, raw[2] * sz, temp
