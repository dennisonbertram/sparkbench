# MS5611 barometric pressure & temperature sensor (TE / MEAS MS5611-01BA03), MicroPython driver.
# I2C only (PS pin high). Follows the datasheet: reset (0x1E) then 2.8 ms PROM reload, read the 8 PROM words
# (0xA0..0xAE) and check the AN520 CRC-4, convert D1 (pressure) / D2 (temperature) at OSR 4096 (0x48 / 0x58,
# max 9.04 ms), read the 24-bit result with ADC read (0x00), then apply the first and second order
# temperature compensation with integer maths exactly as the datasheet flow charts.
import time

_RESET = 0x1E
_ADC_READ = 0x00
_PROM = 0xA0
# OSR -> (D1 command, D2 command, conversion time in ms rounded up from the datasheet maximum)
_OSR = {
    256: (0x40, 0x50, 1),
    512: (0x42, 0x52, 2),
    1024: (0x44, 0x54, 3),
    2048: (0x46, 0x56, 5),
    4096: (0x48, 0x58, 10),
}


def crc4(prom):
    """AN520 CRC-4 over the 8 PROM words, with the low byte of word 7 treated as 0."""
    w = list(prom)
    w[7] &= 0xFF00
    rem = 0
    for cnt in range(16):
        rem ^= (w[cnt >> 1] & 0xFF) if cnt % 2 else (w[cnt >> 1] >> 8)
        for _ in range(8):
            rem = ((rem << 1) ^ 0x3000) & 0xFFFF if rem & 0x8000 else (rem << 1) & 0xFFFF
    return (rem >> 12) & 0x0F


class MS5611:
    def __init__(self, i2c, addr=0x77, osr=4096):
        """addr 0x77 with CSB low (GY-63 default), 0x76 with CSB tied to VCC."""
        self.i2c = i2c
        self.addr = addr
        self.osr = osr
        self.reset()
        self.prom = [self._prom_word(i) for i in range(8)]
        if crc4(self.prom) != self.prom[7] & 0x0F:
            raise OSError('MS5611 PROM CRC mismatch: check the wiring')
        self.C = self.prom  # C[1]..C[6] are the calibration coefficients

    def reset(self):
        self.i2c.writeto(self.addr, bytes([_RESET]))
        time.sleep_ms(3)  # PROM reload takes 2.8 ms

    def _prom_word(self, i):
        self.i2c.writeto(self.addr, bytes([_PROM + 2 * i]))
        b = self.i2c.readfrom(self.addr, 2)
        return (b[0] << 8) | b[1]

    def _convert(self, cmd, wait_ms):
        self.i2c.writeto(self.addr, bytes([cmd]))
        time.sleep_ms(wait_ms)
        self.i2c.writeto(self.addr, bytes([_ADC_READ]))
        b = self.i2c.readfrom(self.addr, 3)
        return (b[0] << 16) | (b[1] << 8) | b[2]

    def read_raw(self):
        """Return (D1, D2): uncompensated pressure and temperature counts."""
        c1, c2, wait = _OSR[self.osr]
        d1 = self._convert(c1, wait)
        d2 = self._convert(c2, wait)
        return d1, d2

    def read(self):
        """Measure once; return (pressure in mbar, temperature in °C), second-order compensated."""
        D1, D2 = self.read_raw()
        C = self.C
        dT = D2 - C[5] * 256
        TEMP = 2000 + dT * C[6] // 8388608
        OFF = C[2] * 65536 + C[4] * dT // 128
        SENS = C[1] * 32768 + C[3] * dT // 256
        T2 = OFF2 = SENS2 = 0
        if TEMP < 2000:
            T2 = dT * dT // 2147483648
            OFF2 = 5 * (TEMP - 2000) ** 2 // 2
            SENS2 = 5 * (TEMP - 2000) ** 2 // 4
            if TEMP < -1500:
                OFF2 += 7 * (TEMP + 1500) ** 2
                SENS2 += 11 * (TEMP + 1500) ** 2 // 2
        TEMP -= T2
        OFF -= OFF2
        SENS -= SENS2
        P = (D1 * SENS // 2097152 - OFF) // 32768
        return P / 100, TEMP / 100

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, sea_level_mbar=1013.25):
        """Approximate altitude in metres from the international barometric formula."""
        return 44330 * (1 - (self.pressure() / sea_level_mbar) ** 0.1903)
