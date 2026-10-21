# M5Stack Unit ADC (SKU U013): TI ADS1100 16-bit delta-sigma ADC behind a 300k/100k input divider.
# ADS1100 (TI SBAS239B): no register pointer. A write is ONE configuration byte
#   ST/BSY 0 0 SC DR1 DR0 PGA1 PGA0   (power-on default 0x8C: continuous, 8 SPS, PGA 1)
# A read returns 3 bytes: output register high, low (two's complement, right-justified,
# sign-extended) and the configuration byte. In single-conversion mode (SC=1) writing ST/BSY=1
# starts one conversion; ST/BSY reads 1 while busy and 0 once the result is in the output register.
# Output code = -MinCode x PGA x (VIN+ - VIN-) / VDD; the reference is the supply (3.3 V on the unit).
# Unit circuit (U013 schematic V1.0): input "+" -> R4 300k -> node -> R5 100k -> GND ("-");
# the node is buffered by an LM358 follower and fed through 1k to VIN+, VIN- is GND.
# So VIN+ = Vin / 4 and Vin = code x VDD x 4 / (-MinCode x PGA).
import time

# Data rate -> (DR bits, -MinCode, conversion time ms at the slowest specified rate)
_RATES = {
    8: (0b11, 32768, 154),    # 16 bits, 6.5-11.5 SPS
    16: (0b10, 16384, 77),    # 15 bits, 13-23 SPS
    32: (0b01, 8192, 39),     # 14 bits, 26-46 SPS
    128: (0b00, 2048, 10),    # 12 bits, 104-184 SPS
}
_GAINS = {1: 0b00, 2: 0b01, 4: 0b10, 8: 0b11}


class UnitADC:
    def __init__(self, i2c, addr=0x48, rate=8, gain=1, vdd=3.3, ratio=4.0):
        """rate: 8/16/32/128 SPS; gain: PGA 1/2/4/8 (full scale = VDD / PGA at the chip).
        vdd: the unit's 3.3 V rail (the ADS1100 reference). ratio: input divider (300k+100k)/100k."""
        if rate not in _RATES:
            raise ValueError('rate must be 8, 16, 32 or 128')
        if gain not in _GAINS:
            raise ValueError('gain must be 1, 2, 4 or 8')
        self.i2c = i2c
        self.addr = addr
        self.rate = rate
        self.gain = gain
        self.vdd = vdd
        self.ratio = ratio

    def _config(self):
        # ST/BSY=1 (start), bits 6-5 = 0, SC=1 (single conversion), DR, PGA
        return 0x80 | 0x10 | (_RATES[self.rate][0] << 2) | _GAINS[self.gain]

    def read_raw(self):
        """Run one conversion and return the signed output code."""
        conv_ms = _RATES[self.rate][2]
        self.i2c.writeto(self.addr, bytes([self._config()]))
        time.sleep_ms(conv_ms)
        for _ in range(50):
            d = self.i2c.readfrom(self.addr, 3)
            if not d[2] & 0x80:  # ST/BSY = 0: conversion finished
                break
            time.sleep_ms(conv_ms // 10 + 1)
        else:
            raise OSError('ADS1100 conversion did not finish')
        raw = (d[0] << 8) | d[1]
        if raw & 0x8000:
            raw -= 0x10000
        return raw

    def lsb(self):
        """Volts per code at the unit's input terminal."""
        return self.vdd * self.ratio / (_RATES[self.rate][1] * self.gain)

    def adc_volts(self):
        """Voltage at the ADS1100 input (VIN+ minus VIN-)."""
        return self.read_raw() * self.vdd / (_RATES[self.rate][1] * self.gain)

    def read_volts(self):
        """Voltage at the unit's + / - terminal (0-12 V)."""
        return self.read_raw() * self.lsb()
