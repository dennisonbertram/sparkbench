# OPT3001 ambient light sensor (Texas Instruments SBOS681C), MicroPython driver.
# 16-bit registers, MSB first; the pointer byte selects the register:
#   0x00 result, 0x01 configuration, 0x02 low limit, 0x03 high limit,
#   0x7E manufacturer ID (0x5449 = "TI"), 0x7F device ID (0x3001).
# Result register: E[3:0] exponent in bits 15..12, R[11:0] mantissa in bits 11..0,
#   lux = 0.01 * 2**E * R   (datasheet equation 3, Table 8).
import time

_REG_RESULT = 0x00
_REG_CONFIG = 0x01
_REG_LOW = 0x02
_REG_HIGH = 0x03
_REG_MFR_ID = 0x7E
_REG_DEV_ID = 0x7F

# Configuration register fields (datasheet Table 10)
_CT = 0x0800        # bit 11: 1 = 800 ms, 0 = 100 ms conversion
_M_SHUTDOWN = 0x0000
_M_SINGLE = 0x0200  # bits 10..9 = 01
_M_CONT = 0x0400    # bits 10..9 = 10
_M_MASK = 0x0600
_OVF = 0x0100       # bit 8, read-only
_CRF = 0x0080       # bit 7, read-only: conversion ready
_L = 0x0010         # bit 4: latched window-style comparison (power-up value)

RANGE_AUTO = 12     # RN = 1100b: automatic full-scale range (power-up default)
# RN 0..11 = manual full-scale range: 40.95 lx * 2**RN, LSB 0.01 lx * 2**RN
# (e.g. 6 = 2620.8 lx / 0.64 lx, 8 = 10483.2 lx / 2.56 lx, 11 = 83865.6 lx / 20.48 lx)


def decode(raw):
    """Result (or limit) register word -> lux (datasheet equation 3)."""
    return 0.01 * (1 << ((raw >> 12) & 0x0F)) * (raw & 0x0FFF)


class OPT3001:
    def __init__(self, i2c, addr=0x44, range_number=RANGE_AUTO, conversion_ms=800, continuous=True):
        """addr 0x44 (ADDR to GND), 0x45 (VDD), 0x46 (SDA), 0x47 (SCL).
        conversion_ms: 800 (full resolution) or 100.
        continuous=True starts continuous conversions and waits for the first result."""
        self.i2c = i2c
        self.addr = addr
        if self._read16(_REG_MFR_ID) != 0x5449 or self._read16(_REG_DEV_ID) != 0x3001:
            raise OSError('OPT3001 not found at 0x%02X' % addr)
        if not (0 <= range_number <= 12):
            raise ValueError('range_number must be 0-11 (manual) or 12 (auto)')
        if conversion_ms not in (100, 800):
            raise ValueError('conversion_ms must be 100 or 800')
        self._base = (range_number << 12) | (_CT if conversion_ms == 800 else 0) | _L
        # Worst-case time for one result: 880 ms / 110 ms max integration (Electrical
        # Characteristics), plus the 10 ms range assessment in auto-range mode.
        self._wait_ms = (880 if conversion_ms == 800 else 110) + (10 if range_number == RANGE_AUTO else 0)
        if continuous:
            self._write16(_REG_CONFIG, self._base | _M_CONT)
            time.sleep_ms(self._wait_ms + 10)  # result register holds 0 until the first conversion ends
        else:
            self._write16(_REG_CONFIG, self._base | _M_SHUTDOWN)

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes(((value >> 8) & 0xFF, value & 0xFF)))

    def raw(self):
        """The result register word (exponent and mantissa)."""
        return self._read16(_REG_RESULT)

    def lux(self):
        """Latest conversion in lux (continuous mode)."""
        return decode(self._read16(_REG_RESULT))

    def config(self):
        """Configuration register. Note: reading it clears CRF (datasheet Table 10)."""
        return self._read16(_REG_CONFIG)

    def overflow(self):
        return bool(self.config() & _OVF)

    def single_shot(self, timeout_ms=2000):
        """Start one conversion (M = 01), wait until the chip returns to shutdown (M = 00)
        with CRF set, and return lux. In auto range a light transient can lengthen it."""
        self._write16(_REG_CONFIG, self._base | _M_SINGLE)
        t0 = time.ticks_ms()
        time.sleep_ms(self._wait_ms)
        while True:
            cfg = self._read16(_REG_CONFIG)
            if cfg & _CRF or not (cfg & _M_MASK):
                break
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('OPT3001 single-shot conversion timed out')
            time.sleep_ms(5)
        return self.lux()

    def shutdown(self):
        """Stop converting (about 0.3 uA)."""
        self._write16(_REG_CONFIG, self._base | _M_SHUTDOWN)

    def limits(self):
        """(low, high) interrupt limits in lux; power-up values 0 and 83865.6."""
        return decode(self._read16(_REG_LOW)), decode(self._read16(_REG_HIGH))
