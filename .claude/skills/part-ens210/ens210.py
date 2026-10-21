# ENS210 relative humidity & temperature sensor (ScioSense, formerly ams), MicroPython driver.
# Written from the ENS210 datasheet (SC-000897-DS-7 v5): fixed I2C address 0x43,
# single-shot T+RH measurement (SENS_START = 0x03, conversion <= 130 ms),
# T_VAL/H_VAL are 3 bytes, little endian: 16-bit data, VALID in bit 16,
# CRC-7 (poly x^7+x^3+1 = 0x89, init 0x7F) over the 17-bit payload in bits 23:17.
import time

ENS210_ADDR = 0x43

_PART_ID = 0x00
_SYS_CTRL = 0x10
_SYS_STAT = 0x11
_SENS_RUN = 0x21
_SENS_START = 0x22
_T_VAL = 0x30

_CONV_MS = 130  # T and RH, single shot, incl. booting (datasheet max)
_BOOT_MS = 2    # booting time 1.2 ms max


def crc7(val):
    """CRC-7 of a 17-bit value, exactly as the datasheet's crc7() routine."""
    pol = 0x89 << 16          # polynomial aligned with the data MSB (incl. room for CRC)
    bit = 1 << 23             # DATA7MSB << CRC7WIDTH
    val = (val << 7) | 0x7F   # make room for the CRC and insert the initial vector
    while bit & (0x1FFFF << 7):
        if bit & val:
            val ^= pol
        bit >>= 1
        pol >>= 1
    return val


def _decode(b0, b1, b2):
    v = b0 | (b1 << 8) | (b2 << 16)
    data = v & 0xFFFF
    valid = (v >> 16) & 1
    if crc7(v & 0x1FFFF) != (v >> 17) & 0x7F:
        raise OSError('ENS210 CRC mismatch: check the wiring')
    if not valid:
        raise OSError('ENS210 data not valid yet')
    return data


class ENS210:
    def __init__(self, i2c, addr=ENS210_ADDR):
        self.i2c = i2c
        self.addr = addr
        self._w(_SYS_CTRL, 0x80)        # RESET
        time.sleep_ms(_BOOT_MS)
        self._w(_SENS_RUN, 0x00)        # both sensors single shot

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def part_id(self):
        """Read PART_ID (0x0210 for an ENS210). Only readable in active state, so low power
        is switched off for the read and back on afterwards, as the datasheet describes."""
        self._w(_SYS_CTRL, 0x00)        # LOW_POWER = 0 -> device goes active
        time.sleep_ms(_BOOT_MS)
        b = self.i2c.readfrom_mem(self.addr, _PART_ID, 2)
        self._w(_SYS_CTRL, 0x01)        # LOW_POWER = 1 (default)
        return b[0] | (b[1] << 8)

    def read(self):
        """Start one T+RH measurement and return (temperature in C, relative humidity in %)."""
        self._w(_SENS_START, 0x03)      # T_START | H_START
        time.sleep_ms(_CONV_MS)
        b = self.i2c.readfrom_mem(self.addr, _T_VAL, 6)
        t = _decode(b[0], b[1], b[2])   # 1/64 K
        h = _decode(b[3], b[4], b[5])   # 1/512 %RH
        return t / 64 - 273.15, h / 512

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
