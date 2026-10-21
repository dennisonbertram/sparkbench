# Plantower PMSA003I laser particulate sensor (I2C version), MicroPython driver.
# From the PMSA003I data manual V2.6: I2C address 0x12, 100 kHz, "standard NXP EEPROM protocol".
# Registers 0x00-0x1F hold one 32-byte frame: 0x42 0x4D, frame length (2x13+2 = 28),
# 13 big-endian 16-bit data words, then a 16-bit check code = sum of bytes 0x00-0x1D.
# The sensor refreshes the frame about once per second.


class PMSA003I:
    ADDR = 0x12

    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def read(self):
        """Read one frame and return a dict of readings.
        Keys: pm1_0_cf1, pm2_5_cf1, pm10_cf1 (ug/m3, CF=1 'factory' values),
        pm1_0, pm2_5, pm10 (ug/m3, atmospheric environment: use these indoors/outdoors),
        n0_3, n0_5, n1_0, n2_5, n5_0, n10 (particles larger than that many um per 0.1 L of air),
        version, error.
        Raises ValueError on a bad header, length or checksum (e.g. still starting up)."""
        d = self.i2c.readfrom_mem(self.addr, 0x00, 32)
        if d[0] != 0x42 or d[1] != 0x4D:
            raise ValueError('PMSA003I: bad frame header')
        if ((d[2] << 8) | d[3]) != 28:
            raise ValueError('PMSA003I: bad frame length')
        if (sum(d[0:30]) & 0xFFFF) != ((d[30] << 8) | d[31]):
            raise ValueError('PMSA003I: checksum mismatch')
        w = [(d[4 + 2 * i] << 8) | d[5 + 2 * i] for i in range(12)]
        return {
            'pm1_0_cf1': w[0], 'pm2_5_cf1': w[1], 'pm10_cf1': w[2],
            'pm1_0': w[3], 'pm2_5': w[4], 'pm10': w[5],
            'n0_3': w[6], 'n0_5': w[7], 'n1_0': w[8],
            'n2_5': w[9], 'n5_0': w[10], 'n10': w[11],
            'version': d[28], 'error': d[29],
        }
