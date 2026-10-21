# KX132-1211 3-axis accelerometer (Kionix / ROHM), MicroPython driver for I2C.
# From the KX132-1211 Product Specifications and Technical Reference Manual (Rev 1.0):
#   WHO_AM_I 0x13 = 0x3D. COTR 0x12 = 0x55.
#   CNTL1 0x1B: PC1 bit 7 (1 = operating, 0 = stand-by), RES bit 6 (1 = high-performance),
#     DRDYE bit 5 (data-ready engine), GSEL[1:0] bits 4:3 (+-2/4/8/16 g).
#     Control registers may only be changed while PC1 = 0 (stand-by).
#   ODCNTL 0x21: OSA[3:0] output data rate, 0x06 = 50 Hz (default, IIR filter on).
#   INS2 0x17 bit 4 DRDY = new data in XOUT_L..ZOUT_H (needs DRDYE = 1).
#   XOUT_L..ZOUT_H 0x08-0x0D: 16-bit two's complement, low byte first. The register address
#     auto-increments, so all six bytes are read in one transaction (as the datasheet recommends).
#   Sensitivity (16 bit): 16384 / 8192 / 4096 / 2048 counts per g at +-2/4/8/16 g.
import time

_COTR = 0x12
_WHO_AM_I = 0x13
_INS2 = 0x17
_CNTL1 = 0x1B
_ODCNTL = 0x21
_XOUT_L = 0x08

_PC1 = 0x80
_RES = 0x40
_DRDYE = 0x20

_GSEL = {2: (0b00, 16384), 4: (0b01, 8192), 8: (0b10, 4096), 16: (0b11, 2048)}


class KX132:
    def __init__(self, i2c, addr=0x1F, g_range=2):
        """addr: 0x1F with ADR pulled to 3.3 V (SparkFun Qwiic board default), 0x1E with ADR to GND.
        g_range: 2, 4, 8 or 16 g full scale."""
        if g_range not in _GSEL:
            raise ValueError('g_range must be 2, 4, 8 or 16')
        self.i2c = i2c
        self.addr = addr
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0x3D:
            raise OSError('KX132 not found (WHO_AM_I 0x%02X, expected 0x3D): check wiring/address' % who)
        gsel, self._counts_per_g = _GSEL[g_range]
        self._w(_CNTL1, 0x00)  # stand-by: settings may only change with PC1 = 0
        self._w(_ODCNTL, 0x06)  # 50 Hz output data rate, IIR low-pass on (corner ODR/9)
        # operating, high-performance, data-ready engine on, chosen range
        self._w(_CNTL1, _PC1 | _RES | _DRDYE | (gsel << 3))
        time.sleep_ms(50)  # start-up (~2 ms at 50 Hz) plus one 20 ms sample period, with margin

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def data_ready(self):
        """True when INS2 DRDY says a new X/Y/Z sample is available."""
        return bool(self.i2c.readfrom_mem(self.addr, _INS2, 1)[0] & 0x10)

    def raw(self):
        """(x, y, z) 16-bit counts, read in one 6-byte auto-increment burst from XOUT_L."""
        for _ in range(40):  # wait up to ~40 ms (two samples at 50 Hz) for fresh data
            if self.data_ready():
                break
            time.sleep_ms(1)
        d = self.i2c.readfrom_mem(self.addr, _XOUT_L, 6)
        out = []
        for i in (0, 2, 4):
            v = d[i] | (d[i + 1] << 8)  # low byte first
            if v & 0x8000:
                v -= 65536
            out.append(v)
        return tuple(out)

    def read(self):
        """(x, y, z) acceleration in g."""
        k = self._counts_per_g
        x, y, z = self.raw()
        return x / k, y / k, z / k

    def read_ms2(self):
        """(x, y, z) acceleration in m/s^2."""
        return tuple(v * 9.80665 for v in self.read())
