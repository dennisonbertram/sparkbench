# QMI8658 6-axis IMU (QST QMI8658A / QMI8658C), MicroPython I2C driver.
# Written from the QST QMI8658A datasheet (13-52-25 Rev A):
#   WHO_AM_I 0x00 = 0x05, REVISION_ID 0x01
#   CTRL1 0x02 (bit6 ADDR_AI auto-increment), CTRL2 0x03 accel aFS<6:4> aODR<3:0>,
#   CTRL3 0x04 gyro gFS<6:4> gODR<3:0>, CTRL7 0x08 (bit1 gEN, bit0 aEN)
#   TEMP_L/H 0x33-0x34 (T = TEMP_H + TEMP_L/256, 256 LSB/degC)
#   AX..AZ 0x35-0x3A, GX..GZ 0x3B-0x40: 16-bit two's complement, low byte first
#   RESET 0x60: write 0xB0 for a soft reset (max 15 ms); register 0x4D reads 0x80 after a good reset.
# I2C address: 0x6A with SA0 (AD0) high or open (internal pull-up), 0x6B with SA0 tied low.
import time

_WHO_AM_I = 0x00
_CTRL1 = 0x02
_CTRL2 = 0x03
_CTRL3 = 0x04
_CTRL7 = 0x08
_TEMP_L = 0x33
_RST_RESULT = 0x4D
_RESET = 0x60

# full-scale -> (aFS / gFS code, LSB per unit) from datasheet Tables 7, 8 and 22
_ACC = {2: (0, 16384.0), 4: (1, 8192.0), 8: (2, 4096.0), 16: (3, 2048.0)}
_GYR = {16: (0, 2048.0), 32: (1, 1024.0), 64: (2, 512.0), 128: (3, 256.0),
        256: (4, 128.0), 512: (5, 64.0), 1024: (6, 32.0), 2048: (7, 16.0)}
_ODR_112HZ = 0x06  # aODR / gODR 0110: 112.1 Hz in 6DOF mode


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 65536 if v & 0x8000 else v


class QMI8658:
    def __init__(self, i2c, addr=None, accel_range=4, gyro_range=512):
        """addr=None tries 0x6A (AD0 open/high) then 0x6B (AD0 to GND)."""
        self.i2c = i2c
        self.addr = None
        for a in ((addr,) if addr is not None else (0x6A, 0x6B)):
            try:
                if i2c.readfrom_mem(a, _WHO_AM_I, 1)[0] == 0x05:
                    self.addr = a
                    break
            except OSError:
                pass
        if self.addr is None:
            raise OSError('QMI8658 not found (WHO_AM_I 0x05 at 0x6A/0x6B): check wiring')
        # Soft reset. The chip stops acknowledging while it resets, so ignore a NACK here.
        try:
            self._w(_RESET, 0xB0)
        except OSError:
            pass
        time.sleep_ms(20)  # reset takes at most 15 ms
        t0 = time.ticks_ms()
        while True:
            try:
                if self._r(_RST_RESULT, 1)[0] == 0x80:
                    break
            except OSError:
                pass
            if time.ticks_diff(time.ticks_ms(), t0) > 500:
                raise OSError('QMI8658 soft reset did not complete')
            time.sleep_ms(10)
        # CTRL1 = 0x60: register auto-increment (ADDR_AI) for burst reads; bit5 left at its
        # reset value 1, as QST's reference driver does. Output registers are read low byte first.
        self._w(_CTRL1, 0x60)
        code, self._acc_lsb = _ACC[accel_range]
        self._w(_CTRL2, (code << 4) | _ODR_112HZ)
        code, self._gyr_lsb = _GYR[gyro_range]
        self._w(_CTRL3, (code << 4) | _ODR_112HZ)
        self._w(_CTRL7, 0x03)   # aEN + gEN
        time.sleep_ms(200)      # gyro turn-on 150 ms + 3/ODR

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _r(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def read(self):
        """Return ((ax, ay, az) in g, (gx, gy, gz) in deg/s, temperature in degC) from one burst read."""
        d = self._r(_TEMP_L, 14)
        t = _s16(d[0], d[1]) / 256
        a = tuple(_s16(d[i], d[i + 1]) / self._acc_lsb for i in (2, 4, 6))
        g = tuple(_s16(d[i], d[i + 1]) / self._gyr_lsb for i in (8, 10, 12))
        return a, g, t

    def acceleration(self):
        return self.read()[0]

    def gyro(self):
        return self.read()[1]

    def temperature(self):
        """Die temperature in degC (TEMP_H + TEMP_L / 256)."""
        d = self._r(_TEMP_L, 2)
        return _s16(d[0], d[1]) / 256
