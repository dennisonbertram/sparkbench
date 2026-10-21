# MS5837-30BA 30 bar pressure & temperature sensor (TE Connectivity), MicroPython driver.
# Written from the TE MS5837-30BA datasheet: reset 0x1E, PROM words 0-6 at 0xA0-0xAC with a CRC-4 in
# bits 15:12 of word 0, D1 (pressure) / D2 (temperature) conversions, ADC read 0x00, first- and
# second-order compensation. Works with the Blue Robotics Bar30 (I2C address 0x76).
import time

_RESET = 0x1E
_ADC_READ = 0x00
_PROM = 0xA0
_CONV_D1 = 0x40
_CONV_D2 = 0x50
# OSR -> (command offset, maximum conversion time in ms from the datasheet ADC table)
_OSR = {256: (0x00, 0.60), 512: (0x02, 1.17), 1024: (0x04, 2.28),
        2048: (0x06, 4.54), 4096: (0x08, 9.04), 8192: (0x0A, 18.08)}


def crc4(words):
    """Datasheet CRC-4 over PROM words 0-6 (CRC nibble of word 0 and subsidiary word 7 taken as 0)."""
    n = list(words[:7]) + [0]
    n[0] &= 0x0FFF
    rem = 0
    for cnt in range(16):
        rem ^= (n[cnt >> 1] & 0xFF) if cnt % 2 else (n[cnt >> 1] >> 8)
        for _ in range(8):
            rem = ((rem << 1) ^ 0x3000) & 0xFFFF if rem & 0x8000 else (rem << 1) & 0xFFFF
    return (rem >> 12) & 0x0F


class MS5837_30BA:
    def __init__(self, i2c, addr=0x76, osr=4096):
        if osr not in _OSR:
            raise ValueError('osr must be 256, 512, 1024, 2048, 4096 or 8192')
        self.i2c = i2c
        self.addr = addr
        self.osr = osr
        self.i2c.writeto(addr, bytes([_RESET]))
        time.sleep_ms(10)
        c = []
        for i in range(7):
            self.i2c.writeto(addr, bytes([_PROM + 2 * i]))
            b = self.i2c.readfrom(addr, 2)
            c.append((b[0] << 8) | b[1])
        if crc4(c) != (c[0] >> 12):
            raise OSError('MS5837 PROM CRC mismatch: check the wiring')
        self.C = c  # C[1]..C[6] are the calibration coefficients

    def _adc(self, cmd):
        off, tmax = _OSR[self.osr]
        self.i2c.writeto(self.addr, bytes([cmd + off]))
        time.sleep_us(int(tmax * 1000) + 500)  # wait the maximum conversion time
        self.i2c.writeto(self.addr, bytes([_ADC_READ]))
        b = self.i2c.readfrom(self.addr, 3)
        return (b[0] << 16) | (b[1] << 8) | b[2]

    def read_raw(self):
        """Return (D1, D2): uncompensated pressure and temperature counts."""
        d1 = self._adc(_CONV_D1)
        d2 = self._adc(_CONV_D2)
        return d1, d2

    def compensate(self, d1, d2):
        """Datasheet first- and second-order compensation. Returns (pressure mbar, temperature °C)."""
        C = self.C
        dT = d2 - C[5] * 256
        TEMP = 2000 + dT * C[6] // 8388608
        OFF = C[2] * 65536 + C[4] * dT // 128
        SENS = C[1] * 32768 + C[3] * dT // 256
        if TEMP < 2000:
            Ti = 3 * dT * dT // 8589934592
            OFFi = 3 * (TEMP - 2000) ** 2 // 2
            SENSi = 5 * (TEMP - 2000) ** 2 // 8
            if TEMP < -1500:
                OFFi += 7 * (TEMP + 1500) ** 2
                SENSi += 4 * (TEMP + 1500) ** 2
        else:
            Ti = 2 * dT * dT // 137438953472
            OFFi = (TEMP - 2000) ** 2 // 16
            SENSi = 0
        OFF2 = OFF - OFFi
        SENS2 = SENS - SENSi
        TEMP2 = TEMP - Ti                              # 0.01 °C
        P2 = (d1 * SENS2 // 2097152 - OFF2) // 8192    # 0.1 mbar
        return P2 / 10, TEMP2 / 100

    def read(self):
        """Measure once: (pressure in mbar, temperature in °C)."""
        return self.compensate(*self.read_raw())

    @staticmethod
    def depth(pressure_mbar, surface_mbar=1013.25, density=1029):
        """Depth in metres below the surface (density 1029 kg/m3 sea water, 997 fresh water)."""
        return (pressure_mbar - surface_mbar) * 100 / (density * 9.80665)
