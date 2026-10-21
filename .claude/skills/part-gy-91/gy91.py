# GY-91 10-DoF module (MPU-9250 + BMP280), MicroPython driver for I2C.
# Written from:
#   TDK InvenSense MPU-9250 product specification PS-MPU-9250A-01 and register map RM-MPU-9250A-00
#     WHO_AM_I 0x75 = 0x71 (MPU-9255 0x73, MPU-6500 without magnetometer 0x70)
#     ACCEL_XOUT_H 0x3B .. GYRO_ZOUT_L 0x48: 7 big-endian two's-complement words
#     accel 16384/8192/4096/2048 LSB/g, gyro 131/65.5/32.8/16.4 LSB/(deg/s)
#     TEMP_degC = TEMP_OUT / 333.87 + 21 (RoomTemp_Offset = 0)
#   AKM AK8963 datasheet (MS1356-E-02): magnetometer at 0x0C once BYPASS_EN (INT_PIN_CFG 0x37 bit 1) is set;
#     WIA 0x00 = 0x48, ST1 0x02 (DRDY), HXL..HZH 0x03-0x08 little-endian, ST2 0x09 (must be read), CNTL1 0x0A,
#     ASAX..ASAZ 0x10-0x12 (fuse ROM), Hadj = H * ((ASA - 128) * 0.5 / 128 + 1), 0.15 uT/LSB in 16-bit mode
#   Bosch BMP280 datasheet BST-BMP280-DS001: chip id 0xD0 = 0x58, calibration 0x88-0x9F,
#     data 0xF7-0xFC, floating-point compensation of section 8.1
import time


def _s16(v):
    return v - 65536 if v & 0x8000 else v


class MPU9250:
    _ACCEL = {2: (0, 16384.0), 4: (1, 8192.0), 8: (2, 4096.0), 16: (3, 2048.0)}
    _GYRO = {250: (0, 131.0), 500: (1, 65.5), 1000: (2, 32.8), 2000: (3, 16.4)}

    def __init__(self, i2c, addr=0x68, accel_range=2, gyro_range=250):
        """addr 0x68 (SDO/SAO low, the GY-91 default) or 0x69 (SDO/SAO at 3.3 V)."""
        if accel_range not in self._ACCEL or gyro_range not in self._GYRO:
            raise ValueError('bad accel_range or gyro_range')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(100)  # register access start-up time: up to 100 ms after power-up
        who = i2c.readfrom_mem(addr, 0x75, 1)[0]
        if who not in (0x71, 0x73, 0x70):
            raise OSError('MPU-9250 not found (WHO_AM_I 0x%02X, expected 0x71)' % who)
        self.who_am_i = who
        self._w(0x6B, 0x80)          # PWR_MGMT_1: H_RESET
        time.sleep_ms(100)
        self._w(0x6B, 0x01)          # wake (SLEEP = 0), CLKSEL = 1 (PLL when ready)
        time.sleep_ms(10)
        self._w(0x6C, 0x00)          # PWR_MGMT_2: all accel and gyro axes on
        self._w(0x1A, 0x03)          # CONFIG: DLPF_CFG 3 (gyro 41 Hz)
        self._w(0x19, 0x04)          # SMPLRT_DIV: 1 kHz / 5 = 200 Hz
        a_sel, self._a_lsb = self._ACCEL[accel_range]
        g_sel, self._g_lsb = self._GYRO[gyro_range]
        self._w(0x1B, g_sel << 3)    # GYRO_CONFIG: GYRO_FS_SEL, FCHOICE_B = 00
        self._w(0x1C, a_sel << 3)    # ACCEL_CONFIG: ACCEL_FS_SEL
        self._w(0x1D, 0x03)          # ACCEL_CONFIG2: A_DLPFCFG 3 (44.8 Hz)
        self._w(0x37, 0x02)          # INT_PIN_CFG: BYPASS_EN, so the AK8963 (and BMP280) share the host bus
        time.sleep_ms(50)            # gyro valid ~35 ms after start
        self._mag_adj = None

    def _w(self, reg, val, addr=None):
        self.i2c.writeto_mem(self.addr if addr is None else addr, reg, bytes([val]))

    def read(self):
        """((ax, ay, az) g, (gx, gy, gz) deg/s, die temperature degC) from one 14-byte burst."""
        d = self.i2c.readfrom_mem(self.addr, 0x3B, 14)
        r = [_s16((d[i] << 8) | d[i + 1]) for i in range(0, 14, 2)]
        a = (r[0] / self._a_lsb, r[1] / self._a_lsb, r[2] / self._a_lsb)
        g = (r[4] / self._g_lsb, r[5] / self._g_lsb, r[6] / self._g_lsb)
        return a, g, r[3] / 333.87 + 21.0

    def _mag_init(self):
        if self.i2c.readfrom_mem(0x0C, 0x00, 1)[0] != 0x48:
            raise OSError('AK8963 magnetometer not found at 0x0C (chip may be an MPU-6500)')
        self._w(0x0A, 0x00, 0x0C)    # CNTL1: power-down before changing mode
        time.sleep_ms(1)
        self._w(0x0A, 0x0F, 0x0C)    # fuse ROM access mode
        time.sleep_ms(1)
        asa = self.i2c.readfrom_mem(0x0C, 0x10, 3)
        self._mag_adj = tuple(((a - 128) * 0.5 / 128 + 1) * 0.15 for a in asa)
        self._w(0x0A, 0x00, 0x0C)    # power-down
        time.sleep_ms(1)
        self._w(0x0A, 0x16, 0x0C)    # BIT = 1 (16-bit), continuous measurement mode 2 (100 Hz)
        time.sleep_ms(10)

    def magnetic(self):
        """(mx, my, mz) in microtesla, in the AK8963's own axes (X/Y swapped, Z inverted vs the accel)."""
        if self._mag_adj is None:
            self._mag_init()
        for _ in range(20):
            if self.i2c.readfrom_mem(0x0C, 0x02, 1)[0] & 0x01:  # ST1 DRDY
                break
            time.sleep_ms(2)
        d = self.i2c.readfrom_mem(0x0C, 0x03, 7)  # HXL..HZH + ST2 (reading ST2 ends the read)
        if d[6] & 0x08:
            raise OSError('AK8963 magnetic sensor overflow')
        h = [_s16(d[i] | (d[i + 1] << 8)) for i in (0, 2, 4)]
        return tuple(h[i] * self._mag_adj[i] for i in range(3))


class BMP280:
    def __init__(self, i2c, addr=0x76):
        """addr 0x76 (SDO/SAO low, the GY-91 default) or 0x77."""
        self.i2c = i2c
        self.addr = addr
        cid = i2c.readfrom_mem(addr, 0xD0, 1)[0]
        if cid != 0x58:
            raise OSError('BMP280 not found at 0x%02X (chip id 0x%02X)' % (addr, cid))
        self._w(0xE0, 0xB6)          # soft reset
        time.sleep_ms(3)             # start-up 2 ms
        for _ in range(50):
            if not (i2c.readfrom_mem(addr, 0xF3, 1)[0] & 0x01):  # im_update: NVM copy running
                break
            time.sleep_ms(1)
        c = i2c.readfrom_mem(addr, 0x88, 24)
        w = [c[2 * k] | (c[2 * k + 1] << 8) for k in range(12)]
        self.T1 = w[0]
        self.T2, self.T3 = _s16(w[1]), _s16(w[2])
        self.P1 = w[3]
        self.P2, self.P3, self.P4, self.P5, self.P6, self.P7, self.P8, self.P9 = [_s16(x) for x in w[4:12]]
        self._w(0xF5, 0x00)          # config: filter off, standby irrelevant in forced mode
        self._w(0xF4, 0x24)          # ctrl_meas: osrs_t x1, osrs_p x1, sleep mode

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read(self):
        """(temperature degC, pressure hPa) from one forced-mode conversion."""
        self._w(0xF4, 0x25)          # osrs_t x1, osrs_p x1, forced mode
        time.sleep_ms(7)             # table 13: 6.4 ms max at x1/x1
        for _ in range(50):
            if not (self.i2c.readfrom_mem(self.addr, 0xF3, 1)[0] & 0x08):  # measuring
                break
            time.sleep_ms(2)
        d = self.i2c.readfrom_mem(self.addr, 0xF7, 6)
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        # bmp280_compensate_T_double
        v1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        v2 = (adc_t / 131072.0 - self.T1 / 8192.0) * (adc_t / 131072.0 - self.T1 / 8192.0) * self.T3
        t_fine = int(v1 + v2)
        t = (v1 + v2) / 5120.0
        # bmp280_compensate_P_double
        v1 = t_fine / 2.0 - 64000.0
        v2 = v1 * v1 * self.P6 / 32768.0
        v2 = v2 + v1 * self.P5 * 2.0
        v2 = v2 / 4.0 + self.P4 * 65536.0
        v1 = (self.P3 * v1 * v1 / 524288.0 + self.P2 * v1) / 524288.0
        v1 = (1.0 + v1 / 32768.0) * self.P1
        if v1 == 0.0:
            return t, 0.0
        p = 1048576.0 - adc_p
        p = (p - v2 / 4096.0) * 6250.0 / v1
        v1 = self.P9 * p * p / 2147483648.0
        v2 = p * self.P8 / 32768.0
        p = p + (v1 + v2 + self.P7) / 16.0
        return t, p / 100.0


class GY91:
    """Both chips of the GY-91 on one I2C bus: imu (MPU-9250 + AK8963) and baro (BMP280)."""

    def __init__(self, i2c, mpu_addr=0x68, bmp_addr=0x76):
        self.imu = MPU9250(i2c, mpu_addr)
        self.baro = BMP280(i2c, bmp_addr)
