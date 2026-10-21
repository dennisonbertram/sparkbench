# ADS1015 12-bit 4-channel I2C ADC (Texas Instruments ADS101x), MicroPython driver.
# Single-shot conversions as in the datasheet (SBAS473F, section 8): write the Config register with
# OS=1 to start, wait until OS reads back 1, then read the Conversion register. The 12-bit result is
# left-justified two's complement in bits 15:4; one LSB = FSR / 2048 (Table 7-1).
import time

_REG_CONVERSION = 0x00
_REG_CONFIG = 0x01

# PGA[2:0] (Config bits 11:9) -> full-scale range in volts (+/-)
_FSR = {0: 6.144, 1: 4.096, 2: 2.048, 3: 1.024, 4: 0.512, 5: 0.256}
# DR[2:0] (Config bits 7:5) -> samples per second
_RATES = {128: 0, 250: 1, 490: 2, 920: 3, 1600: 4, 2400: 5, 3300: 6}
# MUX[2:0] (Config bits 14:12) for single-ended inputs: AINx against GND
_SINGLE = (4, 5, 6, 7)
# Differential pairs (positive, negative) -> MUX[2:0]
_DIFF = {(0, 1): 0, (0, 3): 1, (1, 3): 2, (2, 3): 3}


class ADS1015:
    def __init__(self, i2c, addr=0x48, fsr=4.096, rate=1600):
        """fsr: full-scale range in volts, one of 6.144, 4.096, 2.048 (chip default), 1.024, 0.512, 0.256.
        Never apply more than VDD + 0.3 V to an input, whatever the range."""
        self.i2c = i2c
        self.addr = addr
        self.pga = None
        for code, v in _FSR.items():
            if abs(v - fsr) < 1e-6:
                self.pga = code
        if self.pga is None:
            raise ValueError('fsr must be one of 6.144, 4.096, 2.048, 1.024, 0.512, 0.256')
        if rate not in _RATES:
            raise ValueError('rate must be one of 128, 250, 490, 920, 1600, 2400, 3300')
        self.dr = _RATES[rate]
        self.rate = rate
        self.lsb = _FSR[self.pga] / 2048  # volts per count (e.g. 2 mV at +/-4.096 V)

    def _read_reg(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _convert(self, mux):
        # OS=1 (start single shot), MUX, PGA, MODE=1 (single-shot), DR, comparator disabled (COMP_QUE=11)
        cfg = 0x8000 | (mux << 12) | (self.pga << 9) | 0x0100 | (self.dr << 5) | 0x0003
        self.i2c.writeto(self.addr, bytes([_REG_CONFIG, cfg >> 8, cfg & 0xFF]))
        # Conversion time is 1 / DR (+10 % oscillator tolerance); then poll OS until it reads 1.
        time.sleep_us(int(1100000 / self.rate) + 100)
        for _ in range(100):
            if self._read_reg(_REG_CONFIG) & 0x8000:
                break
            time.sleep_ms(1)
        else:
            raise OSError('ADS1015 conversion timed out: check the wiring')
        raw = self._read_reg(_REG_CONVERSION)
        if raw & 0x8000:
            raw -= 0x10000
        return raw >> 4  # 12-bit signed code, -2048..2047

    def read_raw(self, channel):
        """12-bit code of input AIN<channel> (0-3) measured against GND."""
        if not 0 <= channel <= 3:
            raise ValueError('channel must be 0-3')
        return self._convert(_SINGLE[channel])

    def read_voltage(self, channel):
        """Voltage on AIN<channel> (0-3) against GND, in volts."""
        return self.read_raw(channel) * self.lsb

    def read_differential(self, pos, neg):
        """Voltage AIN<pos> - AIN<neg> for the pairs (0,1), (0,3), (1,3), (2,3), in volts."""
        if (pos, neg) not in _DIFF:
            raise ValueError('pairs are (0,1), (0,3), (1,3), (2,3)')
        return self._convert(_DIFF[(pos, neg)]) * self.lsb
