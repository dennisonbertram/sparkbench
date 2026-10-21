# LSM303DLHC 3-axis accelerometer + 3-axis magnetometer (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet Doc ID 018771 Rev 1. Two I2C chips in one package:
#   accelerometer at 0x19 (registers 0x20-0x3D, set bit 7 of the register address to auto-increment),
#   magnetometer at 0x1E (registers 0x00-0x0C, 0x31-0x32; the pointer auto-increments by itself).
# Accelerometer: high-resolution (12-bit, left-justified, low byte first), +/-2 g, 1 mg/LSB, 100 Hz.
# Magnetometer: continuous conversion, 15 Hz, +/-1.3 gauss: X/Y 1100 LSB/gauss, Z 980 LSB/gauss,
#   data big-endian (high byte first) in the order X, Z, Y.
import time

ACC_ADDR = 0x19
MAG_ADDR = 0x1E

CTRL_REG1_A = 0x20
CTRL_REG4_A = 0x23
STATUS_REG_A = 0x27
OUT_X_L_A = 0x28

CRA_REG_M = 0x00
CRB_REG_M = 0x01
MR_REG_M = 0x02
OUT_X_H_M = 0x03
IRA_REG_M = 0x0A     # IRA/IRB/IRC read 0x48 0x34 0x33 ('H43')

ACC_MG_PER_LSB = 1.0          # +/-2 g (datasheet Table 3, LA_So)
MAG_XY_LSB_PER_GAUSS = 1100   # GN = 001, +/-1.3 gauss (Table 75)
MAG_Z_LSB_PER_GAUSS = 980


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class LSM303DLHC:
    def __init__(self, i2c, acc_addr=ACC_ADDR, mag_addr=MAG_ADDR):
        self.i2c = i2c
        self.acc = acc_addr
        self.mag = mag_addr
        if bytes(self.i2c.readfrom_mem(self.mag, IRA_REG_M, 3)) != b'H43':
            raise OSError('LSM303DLHC magnetometer not found at 0x%02X' % self.mag)
        # Accelerometer: ODR 100 Hz, LPen = 0, X/Y/Z enabled.
        self.i2c.writeto_mem(self.acc, CTRL_REG1_A, b'\x57')
        # BDU = 1, BLE = 0 (low byte first), FS = +/-2 g, HR = 1.
        self.i2c.writeto_mem(self.acc, CTRL_REG4_A, b'\x88')
        # Magnetometer: temperature sensor off, 15 Hz output rate.
        self.i2c.writeto_mem(self.mag, CRA_REG_M, b'\x10')
        # Gain GN = 001: +/-1.3 gauss.
        self.i2c.writeto_mem(self.mag, CRB_REG_M, b'\x20')
        # Continuous-conversion mode.
        self.i2c.writeto_mem(self.mag, MR_REG_M, b'\x00')
        time.sleep_ms(100)  # accel turn-on 7/ODR = 70 ms; first magnetometer sample at 15 Hz ~ 67 ms

    def acceleration(self):
        """(x, y, z) in mg."""
        t0 = time.ticks_ms()
        while not (self.i2c.readfrom_mem(self.acc, STATUS_REG_A, 1)[0] & 0x08):  # ZYXDA
            if time.ticks_diff(time.ticks_ms(), t0) > 200:
                raise OSError('LSM303DLHC: no new accelerometer data')
            time.sleep_ms(2)
        # MSB of the sub-address set: auto-increment over the six output bytes.
        d = self.i2c.readfrom_mem(self.acc, OUT_X_L_A | 0x80, 6)
        # 12-bit two's complement, left-justified, low byte first: shift right by 4.
        return tuple((_s16(d[i + 1], d[i]) >> 4) * ACC_MG_PER_LSB for i in (0, 2, 4))

    def magnetic(self):
        """(x, y, z) in mgauss."""
        # Registers 0x03-0x08: X_H, X_L, Z_H, Z_L, Y_H, Y_L (note the X, Z, Y order).
        d = self.i2c.readfrom_mem(self.mag, OUT_X_H_M, 6)
        x = _s16(d[0], d[1])
        z = _s16(d[2], d[3])
        y = _s16(d[4], d[5])
        return (x * 1000 / MAG_XY_LSB_PER_GAUSS,
                y * 1000 / MAG_XY_LSB_PER_GAUSS,
                z * 1000 / MAG_Z_LSB_PER_GAUSS)
