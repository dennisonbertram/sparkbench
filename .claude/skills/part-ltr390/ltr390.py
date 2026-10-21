# LTR390 UV & ambient light sensor (Lite-On LTR-390UV-01, datasheet DS86-2015-0004), MicroPython driver.
# I2C address 0x53, 8-bit registers. ALS and UVS share one ADC: MAIN_CTRL (0x00) selects the mode
# (0x02 = ALS active, 0x0A = UVS active). Results are 20-bit, LSB first: ALS at 0x0D-0x0F, UVS at 0x10-0x12.
#   Lux = 0.6 x ALS_DATA / (GAIN x INT) x WFAC     (datasheet section 7.1)
#   UVI = UVS_DATA / UV sensitivity x WFAC          (section 7.2; 2300 counts/UVI at gain 18, 20-bit)
import time

_MAIN_CTRL = 0x00
_MEAS_RATE = 0x04
_GAIN = 0x05
_PART_ID = 0x06
_MAIN_STATUS = 0x07
_ALS_DATA = 0x0D
_UVS_DATA = 0x10

# ALS_UVS_GAIN codes (register 0x05, bits 2:0)
GAIN_1 = 0
GAIN_3 = 1
GAIN_6 = 2
GAIN_9 = 3
GAIN_18 = 4
_GAIN_X = (1, 3, 6, 9, 18)

# ALS_UVS_MEAS_RATE resolution codes (register 0x04, bits 6:4). 13-bit is not covered by the lux table.
RES_20BIT = 0  # 400 ms
RES_19BIT = 1  # 200 ms
RES_18BIT = 2  # 100 ms (default)
RES_17BIT = 3  # 50 ms
RES_16BIT = 4  # 25 ms
_CONV_MS = (400, 200, 100, 50, 25)
_INT = (4, 2, 1, 0.5, 0.25)  # integration-time factor of the lux formula
# Measurement-rate code (bits 2:0) no faster than the conversion: 500, 200, 100, 50, 25 ms
_RATE = (0b100, 0b011, 0b010, 0b001, 0b000)

UV_SENSITIVITY = 2300  # counts per UV index at gain 18, 20-bit (datasheet 4.5)


class LTR390:
    def __init__(self, i2c, addr=0x53, als_gain=GAIN_3, als_res=RES_18BIT, wfac=1.0):
        self.i2c = i2c
        self.addr = addr
        if als_gain not in range(5) or als_res not in range(5):
            raise ValueError('als_gain must be a GAIN_ constant and als_res RES_16BIT..RES_20BIT')
        self.als_gain = als_gain
        self.als_res = als_res
        self.wfac = wfac  # window factor: 1 with no window / clear glass
        pid = self._r8(_PART_ID)
        if pid >> 4 != 0xB:  # part number ID 0xB, revision in the low nibble (0xB2)
            raise OSError('LTR390 not found at 0x%02X (PART_ID 0x%02X)' % (addr, pid))

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _measure(self, uvs, gain, res, reg):
        self._w8(_GAIN, gain)
        self._w8(_MEAS_RATE, (res << 4) | _RATE[res])
        # Writing MAIN_CTRL stops any ongoing conversion and starts a new one in the chosen mode.
        self._w8(_MAIN_CTRL, 0x0A if uvs else 0x02)
        self._r8(_MAIN_STATUS)  # reading MAIN_STATUS clears a stale data-status flag
        conv = _CONV_MS[res]
        time.sleep_ms(10 + conv)  # wake-up from standby (max 10 ms) + one conversion
        t0 = time.ticks_ms()
        while not self._r8(_MAIN_STATUS) & 0x08:  # bit 3: new ALS/UVS data
            if time.ticks_diff(time.ticks_ms(), t0) > 2 * conv + 600:
                raise OSError('LTR390: no new data (check the wiring)')
            time.sleep_ms(5)
        d = self.i2c.readfrom_mem(self.addr, reg, 3)
        return d[0] | (d[1] << 8) | ((d[2] & 0x0F) << 16)

    def raw_als(self):
        """One ALS conversion with the configured gain and resolution; returns counts."""
        return self._measure(False, self.als_gain, self.als_res, _ALS_DATA)

    def raw_uvs(self):
        """One UVS conversion at gain 18, 20-bit (the setting the UV sensitivity is specified for)."""
        return self._measure(True, GAIN_18, RES_20BIT, _UVS_DATA)

    def lux(self):
        """Ambient light in lux: 0.6 x ALS_DATA / (GAIN x INT) x WFAC."""
        return 0.6 * self.raw_als() / (_GAIN_X[self.als_gain] * _INT[self.als_res]) * self.wfac

    def uvi(self):
        """UV index: UVS_DATA / 2300 x WFAC."""
        return self.raw_uvs() / UV_SENSITIVITY * self.wfac

    def standby(self):
        """Stop measuring (about 1 uA)."""
        self._w8(_MAIN_CTRL, 0x00)
