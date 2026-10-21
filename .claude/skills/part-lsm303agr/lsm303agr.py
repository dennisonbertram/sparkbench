# LSM303AGR 3-axis accelerometer + 3-axis magnetometer (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet DocID027765 Rev 11. Two I2C chips in one package:
#   accelerometer at 0x19 (registers 0x00-0x3F), magnetometer at 0x1E (registers 0x40-0x6F).
# Accelerometer: high-resolution mode (12-bit, left-justified), +/-2 g, 0.98 mg/LSB, 100 Hz.
# Magnetometer: continuous mode, 10 Hz, high resolution, temperature compensation on, 1.5 mgauss/LSB.
import time

ACC_ADDR = 0x19
MAG_ADDR = 0x1E

WHO_AM_I_A = 0x0F    # reads 0x33
CTRL_REG1_A = 0x20
CTRL_REG4_A = 0x23
STATUS_REG_A = 0x27
OUT_X_L_A = 0x28
WHO_AM_I_M = 0x4F    # reads 0x40
CFG_REG_A_M = 0x60
CFG_REG_C_M = 0x62
STATUS_REG_M = 0x67
OUTX_L_REG_M = 0x68

ACC_MG_PER_LSB = 0.98   # +/-2 g, high-resolution mode (datasheet Table 3)
MAG_MG_PER_LSB = 1.5    # mgauss per LSB (datasheet Table 3)


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class LSM303AGR:
    def __init__(self, i2c, acc_addr=ACC_ADDR, mag_addr=MAG_ADDR):
        self.i2c = i2c
        self.acc = acc_addr
        self.mag = mag_addr
        if self.i2c.readfrom_mem(self.acc, WHO_AM_I_A, 1)[0] != 0x33:
            raise OSError('LSM303AGR accelerometer not found at 0x%02X' % self.acc)
        if self.i2c.readfrom_mem(self.mag, WHO_AM_I_M, 1)[0] != 0x40:
            raise OSError('LSM303AGR magnetometer not found at 0x%02X' % self.mag)
        # Accelerometer: ODR 100 Hz, LPen = 0, X/Y/Z enabled.
        self.i2c.writeto_mem(self.acc, CTRL_REG1_A, b'\x57')
        # BDU = 1, FS = +/-2 g, HR = 1 (12-bit high-resolution mode).
        self.i2c.writeto_mem(self.acc, CTRL_REG4_A, b'\x88')
        # Magnetometer: COMP_TEMP_EN = 1 (required), HR, 10 Hz, continuous mode.
        self.i2c.writeto_mem(self.mag, CFG_REG_A_M, b'\x80')
        # BDU = 1.
        self.i2c.writeto_mem(self.mag, CFG_REG_C_M, b'\x10')
        time.sleep_ms(100)  # HR accel turn-on 7/ODR = 70 ms; mag turn-on 9.4 ms + first sample

    def _wait(self, addr, reg, timeout_ms=200):
        t0 = time.ticks_ms()
        while not (self.i2c.readfrom_mem(addr, reg, 1)[0] & 0x08):  # ZYXDA
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('LSM303AGR: no new data')
            time.sleep_ms(2)

    def acceleration(self):
        """(x, y, z) in mg."""
        self._wait(self.acc, STATUS_REG_A)
        # Set the MSB of the register address to auto-increment over the six output bytes.
        d = self.i2c.readfrom_mem(self.acc, OUT_X_L_A | 0x80, 6)
        # 12-bit two's complement, left-justified in 16 bits: shift right by 4.
        return tuple((_s16(d[i], d[i + 1]) >> 4) * ACC_MG_PER_LSB for i in (0, 2, 4))

    def magnetic(self):
        """(x, y, z) in mgauss."""
        self._wait(self.mag, STATUS_REG_M)
        d = self.i2c.readfrom_mem(self.mag, OUTX_L_REG_M, 6)
        return tuple(_s16(d[i], d[i + 1]) * MAG_MG_PER_LSB for i in (0, 2, 4))
