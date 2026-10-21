# Panasonic SN-GCJA5 laser particulate matter sensor (I2C), MicroPython driver.
# From the SN-GCJA5 Communication Specifications (JA5-SSP-COMM-E1.0):
#   I2C address 0x33 (fixed), up to 400 kHz, 8-bit register address, repeated-start reads.
#   Multi-byte values are little-endian (low byte first).
#   0x00/0x04/0x08: PM1.0 / PM2.5 / PM10 mass density, 4 bytes each, value = raw / 1000 ug/m3.
#   0x0C 0x0E 0x10 0x14 0x16 0x18: particle counts, 2 bytes each
#     (0.3-0.5, 0.5-1.0, 1.0-2.5, 2.5-5.0, 5.0-7.5, 7.5-10 um).
#   0x26 STATE: [7:6] sensor, [5:4] PD, [3:2] LD, [1:0] fan status (0 = normal).
# All registers refresh once per second. First reading about 8 s after power-up,
# stable readings after about 28 s.


class SNGCJA5:
    ADDR = 0x33
    REG_PM1_0 = 0x00
    REG_PM2_5 = 0x04
    REG_PM10 = 0x08
    REG_COUNTS = (0x0C, 0x0E, 0x10, 0x14, 0x16, 0x18)
    REG_STATE = 0x26

    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def _u32(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 4)
        return d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)

    def _u16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)

    def pm(self):
        """Return (PM1.0, PM2.5, PM10) mass density in ug/m3 (0.001 resolution)."""
        d = self.i2c.readfrom_mem(self.addr, self.REG_PM1_0, 12)
        v = [d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24) for i in (0, 4, 8)]
        return v[0] / 1000, v[1] / 1000, v[2] / 1000

    def pm1_0(self):
        return self._u32(self.REG_PM1_0) / 1000

    def pm2_5(self):
        return self._u32(self.REG_PM2_5) / 1000

    def pm10(self):
        return self._u32(self.REG_PM10) / 1000

    def counts(self):
        """Particle counts per size bin: 0.3-0.5, 0.5-1.0, 1.0-2.5, 2.5-5.0, 5.0-7.5, 7.5-10 um."""
        return tuple(self._u16(r) for r in self.REG_COUNTS)

    def state(self):
        """Raw STATE byte (0 = everything normal)."""
        return self.i2c.readfrom_mem(self.addr, self.REG_STATE, 1)[0]

    def status(self):
        """Return dict of 2-bit status fields: sensor, pd, ld, fan (0 = normal, fan 2 = initial calibration)."""
        s = self.state()
        return {'sensor': (s >> 6) & 3, 'pd': (s >> 4) & 3, 'ld': (s >> 2) & 3, 'fan': s & 3}
