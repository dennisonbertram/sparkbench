# TSL2561 light-to-digital converter (TAOS/ams TSL2560/TSL2561), MicroPython driver.
# Written from the TSL2561 datasheet (TAOS059N, March 2009):
#  - every access starts with a COMMAND byte: bit 7 CMD = 1, bit 6 CLEAR (interrupt clear),
#    bit 5 WORD (SMBus read/write word), bit 4 BLOCK, bits 3:0 register address;
#  - CONTROL (0x0): write 0x03 to power up, 0x00 to power down; reads back 0x03 when powered;
#  - TIMING (0x1): bit 4 GAIN (0 = 1x, 1 = 16x), bits 1:0 INTEG (00 13.7 ms, 01 101 ms, 10 402 ms);
#  - DATA0 (0xC/0xD, broadband) and DATA1 (0xE/0xF, infrared) are 16-bit, low byte first,
#    read with the recommended Read Word protocol: command 0xAC (channel 0) and 0xAE (channel 1);
#  - lux from the datasheet's integer CalculateLux() routine for the T, FN and CL packages.
import time

_CMD = 0x80
_WORD = 0x20
_CLEAR = 0x40
_CONTROL = 0x00
_TIMING = 0x01
_ID = 0x0A
_DATA0 = 0x0C
_DATA1 = 0x0E

_POWER_UP = 0x03
_POWER_DOWN = 0x00

# INTEG field -> (nominal integration time in ms, full-scale count)
_INTEG = {0: (14, 5047), 1: (101, 37177), 2: (402, 65535)}
_INTEG_BY_MS = {13: 0, 14: 0, 101: 1, 402: 2}

# Datasheet CalculateLux() constants
_LUX_SCALE = 14
_RATIO_SCALE = 9
_CH_SCALE = 10
_CHSCALE_TINT0 = 0x7517  # 322/11 * 2^CH_SCALE
_CHSCALE_TINT1 = 0x0FE7  # 322/81 * 2^CH_SCALE
# (ratio break K, b, m) for the T, FN and CL packages
_T_TABLE = (
    (0x0040, 0x01F2, 0x01BE),
    (0x0080, 0x0214, 0x02D1),
    (0x00C0, 0x023F, 0x037B),
    (0x0100, 0x0270, 0x03FE),
    (0x0138, 0x016F, 0x01FC),
    (0x019A, 0x00D2, 0x00FB),
    (0x029A, 0x0018, 0x0012),
)
# same for the CS (chipscale) package
_CS_TABLE = (
    (0x0043, 0x0204, 0x01AD),
    (0x0085, 0x0228, 0x02C1),
    (0x00C8, 0x0253, 0x0363),
    (0x010A, 0x0282, 0x03DF),
    (0x014D, 0x0177, 0x01DD),
    (0x019A, 0x0101, 0x0127),
    (0x029A, 0x0037, 0x002B),
)


def calculate_lux(ch0, ch1, gain16=False, integ=2, cs_package=False):
    """Datasheet CalculateLux(): approximate illuminance (integer lux) from raw counts."""
    if integ == 0:
        ch_scale = _CHSCALE_TINT0
    elif integ == 1:
        ch_scale = _CHSCALE_TINT1
    else:
        ch_scale = 1 << _CH_SCALE
    if not gain16:
        ch_scale <<= 4  # scale 1x to 16x
    channel0 = (ch0 * ch_scale) >> _CH_SCALE
    channel1 = (ch1 * ch_scale) >> _CH_SCALE
    ratio1 = 0
    if channel0 != 0:
        ratio1 = (channel1 << (_RATIO_SCALE + 1)) // channel0
    ratio = (ratio1 + 1) >> 1
    b = m = 0  # ratio > 1.30: lux = 0
    for k, bb, mm in (_CS_TABLE if cs_package else _T_TABLE):
        if ratio <= k:
            b, m = bb, mm
            break
    temp = channel0 * b - channel1 * m
    if temp < 0:
        temp = 0
    temp += 1 << (_LUX_SCALE - 1)
    return temp >> _LUX_SCALE


class TSL2561:
    def __init__(self, i2c, addr=0x39, gain=1, integration_ms=402, cs_package=False):
        """addr: 0x39 (ADDR floating), 0x29 (ADDR to GND) or 0x49 (ADDR to 3.3 V).
        gain: 1 or 16. integration_ms: 13 (13.7 ms), 101 or 402.
        cs_package: True only for the chipscale TSL2561CS (breakouts use the T/FN package)."""
        self.i2c = i2c
        self.addr = addr
        self.cs_package = cs_package
        self._write8(_CONTROL, _POWER_UP)
        if self._read8(_CONTROL) & 0x03 != 0x03:
            raise OSError('TSL2561 not responding at 0x%02X: check the wiring and ADDR' % addr)
        part = self._read8(_ID) >> 4
        if part not in (0x0, 0x1, 0x4, 0x5):  # TSL2560/TSL2561 CS or T/FN/CL
            raise OSError('Device at 0x%02X is not a TSL2561 (ID 0x%X)' % (addr, part))
        self.configure(gain, integration_ms)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.addr, _CMD | reg, bytes((value & 0xFF,)))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.addr, _CMD | reg, 1)[0]

    def _read_word(self, reg):
        # SMBus Read Word: command with WORD bit, repeated start, low byte then high byte.
        d = self.i2c.readfrom_mem(self.addr, _CMD | _WORD | reg, 2)
        return d[0] | (d[1] << 8)

    def configure(self, gain=1, integration_ms=402):
        if gain not in (1, 16):
            raise ValueError('gain must be 1 or 16')
        if integration_ms not in _INTEG_BY_MS:
            raise ValueError('integration_ms must be 13, 101 or 402')
        self.gain = gain
        self.integ = _INTEG_BY_MS[integration_ms]
        self._write8(_TIMING, (0x10 if gain == 16 else 0x00) | self.integ)
        # A new setting is only reflected after a full integration cycle.
        self._ready_at = time.ticks_add(time.ticks_ms(), _INTEG[self.integ][0] + 10)

    def _wait_ready(self):
        wait = time.ticks_diff(self._ready_at, time.ticks_ms())
        if wait > 0:
            time.sleep_ms(wait)

    def raw(self):
        """Return (channel 0 broadband counts, channel 1 infrared counts)."""
        self._wait_ready()
        return self._read_word(_DATA0), self._read_word(_DATA1)

    def saturated(self, ch0, ch1):
        full = _INTEG[self.integ][1]
        return ch0 >= full or ch1 >= full

    def lux(self):
        """Illuminance in lux (integer, datasheet algorithm), or None when a channel is saturated."""
        ch0, ch1 = self.raw()
        if self.saturated(ch0, ch1):
            return None
        return calculate_lux(ch0, ch1, self.gain == 16, self.integ, self.cs_package)

    def clear_interrupt(self):
        self.i2c.writeto(self.addr, bytes((_CMD | _CLEAR,)))

    def power_down(self):
        self._write8(_CONTROL, _POWER_DOWN)

    def power_up(self):
        self._write8(_CONTROL, _POWER_UP)
        self._ready_at = time.ticks_add(time.ticks_ms(), _INTEG[self.integ][0] + 10)
