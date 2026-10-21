# LIS2MDL 3-axis magnetometer (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet DocID030621 Rev 5: I2C address 0x1E (fixed), WHO_AM_I 0x4F = 0x40,
# CFG_REG_A/B/C at 0x60..0x62, STATUS_REG 0x67, OUTX_L..OUTZ_H at 0x68..0x6D
# (two's complement, LSB at the lower address), sensitivity 1.5 mgauss/LSB, range +/-49.152 gauss.
# In I2C the MSb of the register address asks for auto-increment, so a 6-byte burst starts at 0x68 | 0x80.
import time

_WHO_AM_I = 0x4F
_CFG_REG_A = 0x60
_CFG_REG_B = 0x61
_CFG_REG_C = 0x62
_STATUS_REG = 0x67
_OUTX_L = 0x68

_SENS_GAUSS = 0.0015  # 1.5 mgauss per LSB (datasheet Table 3)
_ODR = {10: 0x00, 20: 0x04, 50: 0x08, 100: 0x0C}  # ODR[1:0] in CFG_REG_A (Table 25)


class LIS2MDL:
    def __init__(self, i2c, addr=0x1E, odr_hz=10):
        self.i2c = i2c
        self.addr = addr
        who = self._r(_WHO_AM_I, 1)[0]
        if who != 0x40:
            raise OSError('LIS2MDL not found (WHO_AM_I=0x%02X): check wiring' % who)
        if odr_hz not in _ODR:
            raise ValueError('odr_hz must be 10, 20, 50 or 100')
        # CFG_REG_A: SOFT_RST (bit 5) resets the configuration and user registers
        self._w(_CFG_REG_A, 0x20)
        time.sleep_ms(20)
        # CFG_REG_C: BDU=1 (bit 4) so a reading's low and high bytes always belong together;
        # I2C_DIS=0, BLE=0 (LSB at lower address), 4WSPI=0
        self._w(_CFG_REG_C, 0x10)
        # CFG_REG_B: OFF_CANC=1 (bit 1) offset cancellation, LPF off
        self._w(_CFG_REG_B, 0x02)
        # CFG_REG_A: COMP_TEMP_EN=1 (must be 1 for proper operation), LP=0 high-resolution,
        # ODR, MD=00 continuous mode (reset default MD=11 is idle)
        self._w(_CFG_REG_A, 0x80 | _ODR[odr_hz])
        # turn-on time 9.4 ms + 1/ODR with offset cancellation (Table 12)
        time.sleep_ms(10 + 1000 // odr_hz + 10)

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read_raw(self):
        """Raw signed counts (x, y, z)."""
        for _ in range(50):  # wait for Zyxda (bit 3), at most about 0.5 s
            if self._r(_STATUS_REG, 1)[0] & 0x08:
                break
            time.sleep_ms(10)
        d = self._r(_OUTX_L | 0x80, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)
            out.append(v - 65536 if v & 0x8000 else v)
        return tuple(out)

    def read(self):
        """Magnetic field (x, y, z) in gauss (1 gauss = 100 uT)."""
        x, y, z = self.read_raw()
        return x * _SENS_GAUSS, y * _SENS_GAUSS, z * _SENS_GAUSS

    def read_ut(self):
        """Magnetic field (x, y, z) in microtesla."""
        return tuple(v * 100 for v in self.read())
