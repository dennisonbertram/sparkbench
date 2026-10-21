# ADS1115 16-bit 4-channel I2C ADC (Texas Instruments ADS111x, SBAS444E), MicroPython driver.
# Single-shot conversions: write the Config register (pointer 0x01) with OS=1, poll OS until it
# reads 1 (conversion done), then read the Conversion register (pointer 0x00), a 16-bit
# two's-complement value. Volts = raw * FSR / 32768 (LSB = FSR / 2^15, e.g. 125 uV at +/-4.096 V).
import time

# Full-scale range (volts) -> PGA[2:0] bits (datasheet table 8-3)
_PGA = {6.144: 0, 4.096: 1, 2.048: 2, 1.024: 3, 0.512: 4, 0.256: 5}
# Data rate (samples/s) -> DR[2:0] bits
_DR = {8: 0, 16: 1, 32: 2, 64: 3, 128: 4, 250: 5, 475: 6, 860: 7}
# Single-ended channel -> MUX[2:0] (AINx vs GND)
_SINGLE = {0: 4, 1: 5, 2: 6, 3: 7}
# Differential pairs (AINP, AINN) -> MUX[2:0]
_DIFF = {(0, 1): 0, (0, 3): 1, (1, 3): 2, (2, 3): 3}

_REG_CONVERSION = 0x00
_REG_CONFIG = 0x01


class ADS1115:
    def __init__(self, i2c, addr=0x48, fsr=4.096, rate=128):
        if fsr not in _PGA:
            raise ValueError('fsr must be one of 6.144, 4.096, 2.048, 1.024, 0.512, 0.256')
        if rate not in _DR:
            raise ValueError('rate must be one of 8, 16, 32, 64, 128, 250, 475, 860')
        self.i2c = i2c
        self.addr = addr
        self.fsr = fsr
        self.rate = rate

    def _write_reg(self, reg, value):
        self.i2c.writeto(self.addr, bytes([reg, (value >> 8) & 0xFF, value & 0xFF]))

    def _read_reg(self, reg):
        self.i2c.writeto(self.addr, bytes([reg]))
        d = self.i2c.readfrom(self.addr, 2)
        return (d[0] << 8) | d[1]

    def _convert(self, mux):
        config = (0x8000                     # OS = 1: start a single conversion
                  | (mux << 12)              # MUX[2:0]
                  | (_PGA[self.fsr] << 9)    # PGA[2:0]
                  | 0x0100                   # MODE = 1: single-shot
                  | (_DR[self.rate] << 5)    # DR[2:0]
                  | 0x0003)                  # COMP_QUE = 11: comparator off, ALRT hi-Z
        self._write_reg(_REG_CONFIG, config)
        # One conversion takes 1/rate (+ ~25 us wake-up); allow twice that before giving up.
        deadline = time.ticks_add(time.ticks_ms(), 2 * 1000 // self.rate + 10)
        time.sleep_us(1000000 // self.rate)
        while not (self._read_reg(_REG_CONFIG) & 0x8000):
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('ADS1115 conversion timed out: check the wiring')
            time.sleep_ms(1)
        raw = self._read_reg(_REG_CONVERSION)
        return raw - 0x10000 if raw & 0x8000 else raw

    def read_raw(self, channel=0):
        """Single-ended reading of AIN0..AIN3 against GND, as a signed 16-bit code."""
        return self._convert(_SINGLE[channel])

    def read_diff_raw(self, pos=0, neg=1):
        """Differential reading AINpos - AINneg: (0,1), (0,3), (1,3) or (2,3)."""
        return self._convert(_DIFF[(pos, neg)])

    def raw_to_volts(self, raw):
        return raw * self.fsr / 32768

    def read_voltage(self, channel=0):
        """Voltage on AINx (vs GND) in volts."""
        return self.raw_to_volts(self.read_raw(channel))

    def read_diff_voltage(self, pos=0, neg=1):
        return self.raw_to_volts(self.read_diff_raw(pos, neg))
