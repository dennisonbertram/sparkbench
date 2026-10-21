# APDS-9301 ambient light photo sensor (Broadcom/Avago), MicroPython driver.
# Written from the APDS-9301 datasheet (AV02-2315EN, January 2010):
#  - every access starts with a COMMAND byte: bit 7 CMD = 1, bit 6 CLEAR (interrupt clear,
#    write-one-to-clear), bit 5 WORD (Read/Write Word protocol), bit 4 reserved (0), bits 3:0 register;
#  - CONTROL (0x0): write 0x03 to power up, 0x00 to power down; reads back 0x03 when powered;
#  - TIMING (0x1): bit 4 GAIN (0 = 1x, 1 = 16x), bits 1:0 INTEG (00 13.7 ms, 01 101 ms, 10 402 ms),
#    power-on value 0x02 (1x, 402 ms);
#  - ID (0xA): bits 7:4 part number 0101, bits 3:0 revision;
#  - DATA0 (0xC/0xD, visible + IR) and DATA1 (0xE/0xF, IR) are 16-bit, low byte first, read with
#    the Read Word protocol: command 0xAC (channel 0) and 0xAE (channel 1);
#  - lux from the datasheet's empirical CH1/CH0 formula, which is characterised at high gain (16x)
#    and 402 ms; other settings are scaled with the datasheet factors (low gain = 1/16,
#    13.7 ms = 11/322, 101 ms = 81/322).
import time

_CMD = 0x80
_CLEAR = 0x40
_WORD = 0x20
_CONTROL = 0x00
_TIMING = 0x01
_INTERRUPT = 0x06
_ID = 0x0A
_DATA0 = 0x0C
_DATA1 = 0x0E

_POWER_UP = 0x03
_POWER_DOWN = 0x00

# INTEG field -> (nominal integration time in ms, full-scale count, clock-cycle multiple of 918)
_INTEG = {0: (14, 5047, 11), 1: (101, 37177, 81), 2: (402, 65535, 322)}
_INTEG_BY_MS = {13: 0, 14: 0, 101: 1, 402: 2}


def calculate_lux(ch0, ch1, gain16=False, integ=2):
    """Datasheet empirical formula: illuminance in lux (float) from raw channel counts."""
    scale = 322 / _INTEG[integ][2]
    if not gain16:
        scale *= 16
    c0 = ch0 * scale
    c1 = ch1 * scale
    if c0 == 0:
        return 0.0
    ratio = c1 / c0
    if ratio <= 0.50:
        lux = 0.0304 * c0 - 0.062 * c0 * (ratio ** 1.4)
    elif ratio <= 0.61:
        lux = 0.0224 * c0 - 0.031 * c1
    elif ratio <= 0.80:
        lux = 0.0128 * c0 - 0.0153 * c1
    elif ratio <= 1.30:
        lux = 0.00146 * c0 - 0.00112 * c1
    else:
        lux = 0.0
    return lux if lux > 0 else 0.0


class APDS9301:
    def __init__(self, i2c, addr=0x39, gain=1, integration_ms=402):
        """addr: 0x39 (ADDR SEL floating), 0x29 (ADDR SEL to GND) or 0x49 (ADDR SEL to VDD).
        gain: 1 or 16. integration_ms: 13 (13.7 ms), 101 or 402."""
        self.i2c = i2c
        self.addr = addr
        self._write8(_CONTROL, _POWER_UP)
        if self._read8(_CONTROL) & 0x03 != 0x03:
            raise OSError('APDS-9301 not responding at 0x%02X: check the wiring and address' % addr)
        part = self._read8(_ID) >> 4
        if part != 0x5:
            raise OSError('Device at 0x%02X is not an APDS-9301 (ID 0x%X)' % (addr, part))
        self._write8(_INTERRUPT, 0x00)  # level interrupt output disabled
        self.configure(gain, integration_ms)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.addr, _CMD | reg, bytes((value & 0xFF,)))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.addr, _CMD | reg, 1)[0]

    def _read_word(self, reg):
        # Read Word protocol: command with WORD bit, repeated start, low byte then high byte.
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
        # New data appears only after a full integration cycle with the new setting.
        self._ready_at = time.ticks_add(time.ticks_ms(), _INTEG[self.integ][0] + 10)

    def _wait_ready(self):
        wait = time.ticks_diff(self._ready_at, time.ticks_ms())
        if wait > 0:
            time.sleep_ms(wait)

    def raw(self):
        """Return (channel 0 visible+IR counts, channel 1 IR counts)."""
        self._wait_ready()
        return self._read_word(_DATA0), self._read_word(_DATA1)

    def saturated(self, ch0, ch1):
        full = _INTEG[self.integ][1]
        return ch0 >= full or ch1 >= full

    def lux(self):
        """Illuminance in lux (datasheet formula), or None when a channel is saturated."""
        ch0, ch1 = self.raw()
        if self.saturated(ch0, ch1):
            return None
        return calculate_lux(ch0, ch1, self.gain == 16, self.integ)

    def set_thresholds(self, low, high):
        """Channel 0 interrupt window (Write Word protocol, low byte first)."""
        self.i2c.writeto_mem(self.addr, _CMD | _WORD | 0x02, bytes((low & 0xFF, low >> 8 & 0xFF)))
        self.i2c.writeto_mem(self.addr, _CMD | _WORD | 0x04, bytes((high & 0xFF, high >> 8 & 0xFF)))

    def enable_interrupt(self, persist=1):
        """Level interrupt on INT (active low) when channel 0 leaves the window for `persist` cycles."""
        self._write8(_INTERRUPT, 0x10 | (persist & 0x0F))

    def disable_interrupt(self):
        self._write8(_INTERRUPT, 0x00)

    def clear_interrupt(self):
        self.i2c.writeto(self.addr, bytes((_CMD | _CLEAR,)))

    def power_down(self):
        self._write8(_CONTROL, _POWER_DOWN)

    def power_up(self):
        self._write8(_CONTROL, _POWER_UP)
        self._ready_at = time.ticks_add(time.ticks_ms(), _INTEG[self.integ][0] + 10)
