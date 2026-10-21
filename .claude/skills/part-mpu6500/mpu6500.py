# MPU-6500 6-axis IMU (TDK InvenSense), MicroPython driver for I2C.
# From the MPU-6500 product specification (PS-MPU-6500A-01 rev 1.3) and the register map shared
# with the MPU-9250 (which contains the same MPU-6500 die):
#   I2C address 0x68 (AD0 low) / 0x69 (AD0 high); WHO_AM_I 0x75 = 0x70
#   PWR_MGMT_1 0x6B (bit 7 H_RESET, bit 6 SLEEP, CLKSEL[2:0]); PWR_MGMT_2 0x6C
#   SMPLRT_DIV 0x19; CONFIG 0x1A; GYRO_CONFIG 0x1B; ACCEL_CONFIG 0x1C; ACCEL_CONFIG2 0x1D
#   ACCEL_XOUT_H 0x3B .. GYRO_ZOUT_L 0x48: 7 big-endian two's-complement words
#   (accel X, Y, Z, temperature, gyro X, Y, Z)
#   Accel: 16384 / 8192 / 4096 / 2048 LSB/g for +-2/4/8/16 g
#   Gyro: 131 / 65.5 / 32.8 / 16.4 LSB/(deg/s) for +-250/500/1000/2000 dps
#   Temperature: TEMP_degC = (TEMP_OUT - RoomTemp_Offset) / 333.87 + 21, RoomTemp_Offset = 0 LSB
#   Start-up time for register read/write: up to 100 ms; gyro start-up from sleep 35 ms
import time

_SMPLRT_DIV = 0x19
_CONFIG = 0x1A
_GYRO_CONFIG = 0x1B
_ACCEL_CONFIG = 0x1C
_ACCEL_CONFIG2 = 0x1D
_ACCEL_XOUT_H = 0x3B
_PWR_MGMT_1 = 0x6B
_PWR_MGMT_2 = 0x6C
_WHO_AM_I = 0x75

_ACCEL_RANGES = {2: (0, 16384.0), 4: (1, 8192.0), 8: (2, 4096.0), 16: (3, 2048.0)}
_GYRO_RANGES = {250: (0, 131.0), 500: (1, 65.5), 1000: (2, 32.8), 2000: (3, 16.4)}


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 65536 if v & 0x8000 else v


class MPU6500:
    def __init__(self, i2c, addr=0x68, accel_range=2, gyro_range=250):
        """addr: 0x68 with ADO low (module default), 0x69 with ADO high.
        accel_range: 2, 4, 8 or 16 g. gyro_range: 250, 500, 1000 or 2000 deg/s."""
        if accel_range not in _ACCEL_RANGES or gyro_range not in _GYRO_RANGES:
            raise ValueError('bad accel_range or gyro_range')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(100)  # start-up time for register read/write: up to 100 ms after power-up
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        # 0x71/0x73 = MPU-9250/9255, which contain the same MPU-6500 die and registers.
        # 0x68 = MPU-6050: different temperature formula and no ACCEL_CONFIG2, so it is rejected.
        if who not in (0x70, 0x71, 0x73):
            raise OSError('MPU-6500 not found (WHO_AM_I 0x%02X, expected 0x70): check wiring, NCS high' % who)
        self.who_am_i = who
        self._w(_PWR_MGMT_1, 0x80)   # H_RESET: restore default register values
        time.sleep_ms(100)
        self._w(_PWR_MGMT_1, 0x01)   # wake (SLEEP = 0), CLKSEL = 1: PLL if ready, else internal oscillator
        time.sleep_ms(10)
        self._w(_PWR_MGMT_2, 0x00)   # all accel and gyro axes on
        self._w(_CONFIG, 0x03)       # DLPF_CFG = 3: gyro 41 Hz bandwidth, 1 kHz internal rate
        self._w(_SMPLRT_DIV, 0x04)   # 1 kHz / (1 + 4) = 200 Hz output rate
        a_sel, self._a_lsb = _ACCEL_RANGES[accel_range]
        g_sel, self._g_lsb = _GYRO_RANGES[gyro_range]
        self._w(_GYRO_CONFIG, g_sel << 3)    # GYRO_FS_SEL, FCHOICE_B = 00 (DLPF in use)
        self._w(_ACCEL_CONFIG, a_sel << 3)   # ACCEL_FS_SEL
        self._w(_ACCEL_CONFIG2, 0x03)        # A_DLPFCFG = 3: accel 44.8 Hz bandwidth
        time.sleep_ms(50)  # gyro valid 35 ms after leaving sleep, accel 20 ms

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def raw(self):
        """(ax, ay, az, temp, gx, gy, gz) raw counts from one 14-byte burst (same sample)."""
        d = self.i2c.readfrom_mem(self.addr, _ACCEL_XOUT_H, 14)
        return tuple(_s16(d[i], d[i + 1]) for i in range(0, 14, 2))

    def read(self):
        """((ax, ay, az) in g, (gx, gy, gz) in deg/s, chip temperature in deg C)."""
        r = self.raw()
        a = (r[0] / self._a_lsb, r[1] / self._a_lsb, r[2] / self._a_lsb)
        g = (r[4] / self._g_lsb, r[5] / self._g_lsb, r[6] / self._g_lsb)
        return a, g, r[3] / 333.87 + 21.0

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        return self.read()[2]
