# MicroPython driver for the Analog Devices ADXL355 low-noise 3-axis accelerometer (I2C).
# Written from the ADXL354/ADXL355 data sheet (register map table 14, register definitions):
#   DEVID_AD 0x00 = 0xAD, DEVID_MST 0x01 = 0x1D, PARTID 0x02 = 0xED,
#   TEMP2 0x06 (bits 11:8) / TEMP1 0x07 (bits 7:0), 12-bit unsigned, right justified,
#   XDATA3..ZDATA1 0x08-0x10: 20-bit twos complement, left justified, MSB first
#     (DATA3 = bits 19:12, DATA2 = bits 11:4, DATA1 bits 7:4 = bits 3:0),
#   Filter 0x28 (ODR_LPF bits 3:0), Range 0x2C (I2C_HS bit 7, INT_POL bit 6, range bits 1:0),
#   POWER_CTL 0x2D (STANDBY bit 0, reset value 0x01 = standby), Reset 0x2F (write 0x52).
#   Sensitivity: 256000 LSB/g (+-2 g), 128000 (+-4 g), 64000 (+-8 g).
#   Temperature: 1885 LSB at 25 C, -9.05 LSB/C (Rev. C; Rev. A printed 1852 LSB).
#   I2C address 0x1D with ASEL (MISO) low, 0x53 with it high. SCLK/VSSIO must be tied to ground for I2C.
import time

REG_DEVID_AD = 0x00
REG_DEVID_MST = 0x01
REG_PARTID = 0x02
REG_STATUS = 0x04      # bit 0 DATA_RDY
REG_TEMP2 = 0x06
REG_XDATA3 = 0x08      # 0x08..0x10: X3 X2 X1 Y3 Y2 Y1 Z3 Z2 Z1
REG_FILTER = 0x28
REG_RANGE = 0x2C
REG_POWER_CTL = 0x2D
REG_RESET = 0x2F

RESET_CODE = 0x52
_RANGE_BITS = {2: 0x01, 4: 0x02, 8: 0x03}
_LSB_PER_G = {2: 256000.0, 4: 128000.0, 8: 64000.0}
TEMP_INTERCEPT_LSB = 1885.0   # at 25 C
TEMP_SLOPE_LSB_PER_C = -9.05
STANDARD_GRAVITY = 9.80665


def _s20(b3, b2, b1):
    v = (b3 << 12) | (b2 << 4) | (b1 >> 4)
    return v - 0x100000 if v & 0x80000 else v


class ADXL355:
    def __init__(self, i2c, addr=0x1D, g_range=2, odr_lpf=0x05):
        """addr 0x1D with ASEL/MISO tied low, 0x53 with it tied high.
        g_range: 2, 4 or 8. odr_lpf: Filter register ODR_LPF code (0x00 = 4000 Hz ... 0x05 = 125 Hz ... 0x0A = 3.9 Hz)."""
        if g_range not in _RANGE_BITS:
            raise ValueError("g_range must be 2, 4 or 8")
        self.i2c = i2c
        self.addr = addr
        ids = self._r(REG_DEVID_AD, 3)
        if ids[0] != 0xAD or ids[1] != 0x1D or ids[2] != 0xED:
            raise OSError("ADXL355 not found at 0x%02X (IDs %02X %02X %02X, expected AD 1D ED)" % (addr, ids[0], ids[1], ids[2]))
        self._w(REG_RESET, RESET_CODE)  # soft reset, like power-on (back to standby)
        time.sleep_ms(10)
        # Configuration may only change while STANDBY = 1.
        self._w(REG_POWER_CTL, 0x01)
        self._w(REG_FILTER, odr_lpf & 0x0F)  # no high-pass filter
        # I2C_HS = 0 (fast mode, 100/400 kHz bus), INT_POL = 0, range bits.
        self._w(REG_RANGE, _RANGE_BITS[g_range])
        self.lsb_per_g = _LSB_PER_G[g_range]
        self._w(REG_POWER_CTL, 0x00)  # measurement mode, temperature on
        time.sleep_ms(20)  # turn-on time < 10 ms, plus the first sample

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def data_ready(self):
        return bool(self._r(REG_STATUS, 1)[0] & 0x01)

    def raw(self):
        """(x, y, z) as signed 20-bit counts, read in one 9-byte burst (the address auto-increments)."""
        d = self._r(REG_XDATA3, 9)
        return _s20(d[0], d[1], d[2]), _s20(d[3], d[4], d[5]), _s20(d[6], d[7], d[8])

    def read(self):
        """(x, y, z) acceleration in g."""
        x, y, z = self.raw()
        s = self.lsb_per_g
        return x / s, y / s, z / s

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        x, y, z = self.read()
        return x * STANDARD_GRAVITY, y * STANDARD_GRAVITY, z * STANDARD_GRAVITY

    def temperature(self):
        """Die temperature in C (typical calibration; good for drift compensation, not as a thermometer)."""
        d = self._r(REG_TEMP2, 2)
        raw = ((d[0] & 0x0F) << 8) | d[1]
        return 25.0 + (raw - TEMP_INTERCEPT_LSB) / TEMP_SLOPE_LSB_PER_C
