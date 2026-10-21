# TMP102 digital temperature sensor (Texas Instruments SBOS397I), MicroPython driver.
# 16-bit registers, MSB first; the pointer byte selects the register:
#   0x00 temperature (read-only), 0x01 configuration, 0x02 TLOW, 0x03 THIGH.
# Temperature register: 12-bit two's complement, left-justified (bits 15..4), 0.0625 degC/LSB.
# Bit 0 of the low byte is 1 in extended mode (13-bit, bits 15..3).
import time

_REG_TEMP = 0x00
_REG_CONFIG = 0x01
_REG_TLOW = 0x02
_REG_THIGH = 0x03

_CFG_SD = 0x0100   # byte 1 bit 0: shutdown
_CFG_OS = 0x8000   # byte 1 bit 7: one-shot / conversion ready
_CFG_RES = 0x6000  # byte 1 bits 6..5: R1 R0, read-only, always 11
_CFG_EM = 0x0010   # byte 2 bit 4: extended mode
_CFG_CR = 0x00C0   # byte 2 bits 7..6: conversion rate

# CR1 CR0 -> conversions per second (datasheet Table 6-5)
RATE_0_25HZ = 0
RATE_1HZ = 1
RATE_4HZ = 2  # power-up default
RATE_8HZ = 3


def _decode(hi, lo, extended):
    """Temperature / TLOW / THIGH register bytes -> degC (datasheet Tables 6-8, 6-9, 6-13..6-16)."""
    raw = (hi << 8) | lo
    if extended:   # extended mode: 13-bit result in bits 15..3
        raw >>= 3
        if raw & 0x1000:
            raw -= 0x2000
    else:          # normal mode: 12-bit result in bits 15..4
        raw >>= 4
        if raw & 0x800:
            raw -= 0x1000
    return raw * 0.0625


class TMP102:
    def __init__(self, i2c, addr=0x48):
        self.i2c = i2c
        self.addr = addr
        cfg = self._read16(_REG_CONFIG)
        if cfg & _CFG_RES != _CFG_RES:  # R1/R0 always read 11 on a TMP102
            raise OSError('TMP102 not found at 0x%02X (config 0x%04X)' % (addr, cfg))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def temperature(self):
        """Latest conversion in degC. Reads 0 until the first conversion (~10-15 ms after power-up)."""
        d = self.i2c.readfrom_mem(self.addr, _REG_TEMP, 2)
        return _decode(d[0], d[1], d[1] & 0x01)  # low-byte bit 0 = 1 in extended mode

    def set_rate(self, rate):
        """Continuous conversion rate: RATE_0_25HZ, RATE_1HZ, RATE_4HZ (default) or RATE_8HZ."""
        cfg = self._read16(_REG_CONFIG) & ~_CFG_CR
        self._write16(_REG_CONFIG, (cfg | ((rate & 3) << 6)) & ~_CFG_OS)

    def shutdown(self, off=True):
        """SD bit: stop converting (under 1 uA) or resume continuous conversion."""
        cfg = self._read16(_REG_CONFIG) & ~_CFG_OS
        self._write16(_REG_CONFIG, (cfg | _CFG_SD) if off else (cfg & ~_CFG_SD))
        if not off:
            time.sleep_ms(30)  # first new result after one conversion (15 ms max)

    def one_shot(self):
        """From shutdown: start a single conversion (OS = 1), wait for it, return degC."""
        cfg = self._read16(_REG_CONFIG)
        self._write16(_REG_CONFIG, cfg | _CFG_SD | _CFG_OS)
        t0 = time.ticks_ms()
        time.sleep_ms(15)  # conversion time: 10 ms typical, 15 ms max
        while not (self._read16(_REG_CONFIG) & _CFG_OS):  # OS reads 1 when done
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('TMP102 one-shot conversion timed out')
            time.sleep_ms(2)
        return self.temperature()

    def limits(self):
        """(TLOW, THIGH) in degC; power-up values are 75 and 80."""
        ext = self._read16(_REG_CONFIG) & _CFG_EM
        tl = self.i2c.readfrom_mem(self.addr, _REG_TLOW, 2)
        th = self.i2c.readfrom_mem(self.addr, _REG_THIGH, 2)
        return _decode(tl[0], tl[1], ext), _decode(th[0], th[1], ext)
