# ADS1118 16-bit SPI ADC with internal temperature sensor (Texas Instruments SBAS457F), MicroPython driver.
# SPI mode 1 (CPOL = 0, CPHA = 1), SCLK up to 4 MHz (tSCLK >= 250 ns).
# Every 16-bit transfer clocks the 16-bit Config register in on DIN while the last conversion
# result is clocked out on DOUT (Figure 42). Single-shot use, as in the datasheet:
#   1. write the Config word with SS = 1 -> starts one conversion (device is in power-down)
#   2. wait one conversion period (1 / data rate, +10 % oscillator tolerance)
#   3. write the same Config word again and read the 16-bit result in the same transfer
# Config word (Table 7): SS | MUX[2:0] | PGA[2:0] | MODE | DR[2:0] | TS_MODE | PULL_UP_EN | NOP[1:0]=01 | 1
# ADC result: 16-bit two's complement, LSB = FSR / 2^15 (Table 3; 125 uV at +/-4.096 V).
# Temperature: 14-bit two's complement, left-justified, 0.03125 degC per LSB (Table 4).
from machine import Pin
import time

_FSR = {6.144: 0, 4.096: 1, 2.048: 2, 1.024: 3, 0.512: 4, 0.256: 5}
_DR = {8: 0, 16: 1, 32: 2, 64: 3, 128: 4, 250: 5, 475: 6, 860: 7}


class ADS1118:
    def __init__(self, spi, cs, fsr=4.096, data_rate=128):
        """spi: machine.SPI with polarity=0, phase=1 (SPI mode 1), <= 4 MHz.
        cs: GPIO number of CS. fsr: full-scale range in volts (6.144, 4.096, 2.048,
        1.024, 0.512 or 0.256). Inputs must still stay between GND and VDD."""
        if fsr not in _FSR:
            raise ValueError('fsr must be one of 6.144, 4.096, 2.048, 1.024, 0.512, 0.256')
        if data_rate not in _DR:
            raise ValueError('data_rate must be 8, 16, 32, 64, 128, 250, 475 or 860')
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.fsr = fsr
        self._pga = _FSR[fsr]
        self._dr = _DR[data_rate]
        self._wait_ms = 1100 // data_rate + 2  # one conversion, +10 % data-rate tolerance
        self._tx = bytearray(2)
        self._rx = bytearray(2)

    def _xfer(self, cfg):
        self._tx[0] = cfg >> 8
        self._tx[1] = cfg & 0xFF
        self.cs.value(0)
        self.spi.write_readinto(self._tx, self._rx)
        self.cs.value(1)  # CS high resets the serial interface (16-bit cycle)
        return (self._rx[0] << 8) | self._rx[1]

    def _convert(self, cfg):
        self._xfer(cfg)               # SS = 1: start a single-shot conversion
        time.sleep_ms(self._wait_ms)  # wait for it to finish
        return self._xfer(cfg)        # read the result (same config written again)

    def _cfg(self, mux, ts):
        # SS=1, MUX, PGA, MODE=1 (single-shot), DR, TS_MODE, PULL_UP_EN=1, NOP=01, reserved=1
        return (0x8000 | (mux << 12) | (self._pga << 9) | 0x0100 |
                (self._dr << 5) | (0x10 if ts else 0) | 0x08 | 0x02 | 0x01)

    def read_raw(self, channel):
        """Single-ended reading of AIN<channel> against GND (MUX 100..111); signed 16-bit code."""
        if not 0 <= channel <= 3:
            raise ValueError('ADS1118 channel must be 0-3')
        raw = self._convert(self._cfg(4 + channel, False))
        return raw - 0x10000 if raw & 0x8000 else raw

    def raw_to_volts(self, raw):
        return raw * self.fsr / 32768

    def read_volts(self, channel):
        return self.raw_to_volts(self.read_raw(channel))

    def temperature(self):
        """Internal temperature sensor in degC (TS_MODE = 1). MUX/PGA keep their reset values."""
        raw = self._convert(0x8000 | (0 << 12) | (2 << 9) | 0x0100 | (self._dr << 5) | 0x10 | 0x08 | 0x02 | 0x01) >> 2
        if raw & 0x2000:
            raw -= 0x4000
        return raw * 0.03125
