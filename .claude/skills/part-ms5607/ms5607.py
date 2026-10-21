# MS5607-02BA03 barometric pressure & temperature sensor (TE / MEAS), MicroPython driver.
# I2C mode (PS high). Reset 0x1E, read the 8-word calibration PROM (0xA0-0xAE) and check its AN520 CRC-4,
# convert D1 (pressure) and D2 (temperature) at OSR 4096 (0x48 / 0x58, max 9.04 ms), read the 24-bit
# result with ADC read 0x00, then apply the datasheet's first- and second-order compensation (MS5607 constants).
import time

_RESET = 0x1E
_ADC_READ = 0x00
_PROM = 0xA0
# OSR -> (convert D1 command, convert D2 command, max conversion time in ms, rounded up)
_OSR = {256: (0x40, 0x50, 1), 512: (0x42, 0x52, 2), 1024: (0x44, 0x54, 3),
        2048: (0x46, 0x56, 5), 4096: (0x48, 0x58, 10)}


def crc4(prom):
    """AN520 CRC-4 over the 8 PROM words, with the CRC nibble (low 4 bits of word 7) taken as 0."""
    w = list(prom)
    w[7] &= 0xFF00
    rem = 0
    for cnt in range(16):
        rem ^= (w[cnt >> 1] & 0xFF) if cnt & 1 else (w[cnt >> 1] >> 8)
        for _ in range(8):
            rem = ((rem << 1) ^ 0x3000) & 0xFFFF if rem & 0x8000 else (rem << 1) & 0xFFFF
    return (rem >> 12) & 0xF


class MS5607:
    def __init__(self, i2c, addr=0x76, osr=4096):
        self.i2c = i2c
        self.addr = addr
        self.osr = osr
        self.reset()
        self.prom = [self._prom(i) for i in range(8)]
        if crc4(self.prom) != self.prom[7] & 0xF:
            raise OSError('MS5607 PROM CRC mismatch: check the wiring')
        self.C = self.prom  # C[1]..C[6] are the calibration coefficients

    def reset(self):
        self.i2c.writeto(self.addr, bytes([_RESET]))
        time.sleep_ms(3)  # PROM reload takes 2.8 ms

    def _prom(self, i):
        self.i2c.writeto(self.addr, bytes([_PROM + 2 * i]))
        b = self.i2c.readfrom(self.addr, 2)
        return (b[0] << 8) | b[1]

    def _adc(self, cmd, wait_ms):
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)
        self.i2c.writeto(self.addr, bytes([_ADC_READ]))
        b = self.i2c.readfrom(self.addr, 3)
        v = (b[0] << 16) | (b[1] << 8) | b[2]
        if v == 0:
            raise OSError('MS5607 conversion not finished')
        return v

    def raw(self):
        d1c, d2c, ms = _OSR[self.osr]
        return self._adc(d1c, ms), self._adc(d2c, ms)

    def read(self):
        """Measure once and return (pressure in mbar, temperature in °C)."""
        D1, D2 = self.raw()
        C = self.C
        dT = D2 - (C[5] << 8)
        TEMP = 2000 + ((dT * C[6]) >> 23)
        OFF = (C[2] << 17) + ((C[4] * dT) >> 6)
        SENS = (C[1] << 16) + ((C[3] * dT) >> 7)
        if TEMP < 2000:  # second-order compensation (datasheet figure 3)
            T2 = (dT * dT) >> 31
            OFF2 = (61 * (TEMP - 2000) ** 2) >> 4
            SENS2 = 2 * (TEMP - 2000) ** 2
            if TEMP < -1500:
                OFF2 += 15 * (TEMP + 1500) ** 2
                SENS2 += 8 * (TEMP + 1500) ** 2
            TEMP -= T2
            OFF -= OFF2
            SENS -= SENS2
        P = (((D1 * SENS) >> 21) - OFF) >> 15
        return P / 100, TEMP / 100

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, sea_level_mbar=1013.25):
        """Altitude in metres from the international barometric formula."""
        return 44330 * (1 - (self.pressure() / sea_level_mbar) ** 0.1903)
