# M5Stack ENV III unit (U001-C) MicroPython driver: Sensirion SHT30 (0x44) + QST QMP6988 (0x70) on one I2C bus.
# SHT30: Sensirion SHT3x-DIS datasheet - single shot, high repeatability, no clock stretching (0x2400, max 15.5 ms),
#   6-byte reply with CRC-8 (poly 0x31, init 0xFF); T = -45 + 175*S/65535 degC, RH = 100*S/65535 %.
# QMP6988: QST QMP6988 datasheet Rev C - chip id 0x5C at 0xD1, soft reset 0xE6 -> 0xE0, OTP coefficients 0xA0..0xB8,
#   forced mode via CTRL_MEAS 0xF4, data burst 0xF7..0xFC (pressure then temperature, 24 bits, minus 2^23),
#   Tr = a0 + a1*Dt + a2*Dt^2 [1/256 degC];
#   Pr = b00 + bt1*Tr + bp1*Dp + b11*Tr*Dp + bt2*Tr^2 + bp2*Dp^2 + b12*Dp*Tr^2 + b21*Dp^2*Tr + bp3*Dp^3 [Pa];
#   K = A + S*OTP/32767 (16-bit signed OTP), a0/b00 = 20-bit signed OTP / 16.
import time

SHT30_ADDR = 0x44
QMP6988_ADDR = 0x70


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def _s16(v):
    return v - 65536 if v > 32767 else v


def _s20(v):
    return v - 1048576 if v > 524287 else v


class SHT30:
    def __init__(self, i2c, addr=SHT30_ADDR):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(2)  # power-up time, max 1.5 ms

    def reset(self):
        self.i2c.writeto(self.addr, b'\x30\xa2')  # soft reset, ready after 1.5 ms
        time.sleep_ms(2)

    def read(self):
        """Measure once; returns (temperature degC, relative humidity %)."""
        self.i2c.writeto(self.addr, b'\x24\x00')
        time.sleep_ms(20)  # high repeatability takes up to 15.5 ms
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('SHT30 CRC mismatch: check the cable')
        t = -45 + 175 * ((d[0] << 8) | d[1]) / 65535
        h = 100 * ((d[3] << 8) | d[4]) / 65535
        return t, h


# (A, S) conversion factors and the OTP register of the high byte, datasheet section 4.3.
_K = (
    ('a1', -6.30e-03, 4.30e-04, 0xB4),
    ('a2', -1.90e-11, 1.20e-10, 0xB6),
    ('bt1', 1.00e-01, 9.10e-02, 0xA2),
    ('bt2', 1.20e-08, 1.20e-06, 0xA4),
    ('bp1', 3.30e-02, 1.90e-02, 0xA6),
    ('b11', 2.10e-07, 1.40e-07, 0xA8),
    ('bp2', -6.30e-10, 3.50e-10, 0xAA),
    ('b12', 2.90e-13, 7.60e-13, 0xAC),
    ('b21', 2.10e-15, 1.20e-14, 0xAE),
    ('bp3', 1.30e-16, 7.90e-17, 0xB0),
)


class QMP6988:
    # CTRL_MEAS: temp_average x4 (011), press_average x8 (100), force mode (01) -> 24-bit results
    CTRL = (0b011 << 5) | (0b100 << 2) | 0b01

    def __init__(self, i2c, addr=QMP6988_ADDR):
        self.i2c = i2c
        self.addr = addr
        cid = i2c.readfrom_mem(addr, 0xD1, 1)[0]
        if cid != 0x5C:
            raise OSError('QMP6988 not found (chip id 0x%02x)' % cid)
        i2c.writeto_mem(addr, 0xE0, b'\xe6')  # soft reset
        time.sleep_ms(10)
        c = i2c.readfrom_mem(addr, 0xA0, 25)  # 0xA0..0xB8
        k = {}
        for name, a, s, reg in _K:
            i = reg - 0xA0
            k[name] = a + s * _s16((c[i] << 8) | c[i + 1]) / 32767
        ex = c[0xB8 - 0xA0]
        k['b00'] = _s20((c[0] << 12) | (c[1] << 4) | (ex >> 4)) / 16
        k['a0'] = _s20((c[0xB2 - 0xA0] << 12) | (c[0xB3 - 0xA0] << 4) | (ex & 0x0F)) / 16
        self.k = k

    def read(self):
        """Measure once (force mode); returns (pressure hPa, chip temperature degC)."""
        self.i2c.writeto_mem(self.addr, 0xF4, bytes([self.CTRL]))
        time.sleep_ms(20)
        for _ in range(20):  # DEVICE_STAT bit 3 = measuring
            if not self.i2c.readfrom_mem(self.addr, 0xF3, 1)[0] & 0x08:
                break
            time.sleep_ms(5)
        d = self.i2c.readfrom_mem(self.addr, 0xF7, 6)
        dp = ((d[0] << 16) | (d[1] << 8) | d[2]) - 8388608
        dt = ((d[3] << 16) | (d[4] << 8) | d[5]) - 8388608
        k = self.k
        tr = k['a0'] + k['a1'] * dt + k['a2'] * dt * dt
        pr = (k['b00'] + k['bt1'] * tr + k['bp1'] * dp + k['b11'] * tr * dp + k['bt2'] * tr * tr
              + k['bp2'] * dp * dp + k['b12'] * dp * tr * tr + k['b21'] * dp * dp * tr + k['bp3'] * dp * dp * dp)
        return pr / 100, tr / 256


class ENV3:
    def __init__(self, i2c):
        self.sht = SHT30(i2c)
        self.qmp = QMP6988(i2c)

    def read(self):
        """Returns (temperature degC, humidity %, pressure hPa)."""
        t, h = self.sht.read()
        p, _ = self.qmp.read()
        return t, h, p

    def altitude(self, sea_level_hpa=1013.25):
        p = self.qmp.read()[0]
        return 44330 * (1 - (p / sea_level_hpa) ** 0.1903)
