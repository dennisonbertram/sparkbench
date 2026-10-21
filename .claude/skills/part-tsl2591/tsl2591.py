# TSL2591 high dynamic range light-to-digital converter (ams TSL25911FN), MicroPython driver.
# Written from the ams TSL2591 datasheet (ams163.5, Apr. 2013):
#  - I2C address 0x29 (fixed); every register access starts with a COMMAND byte:
#    bit 7 CMD = 1, bits 6:5 TRANSACTION = 01 (normal operation), bits 4:0 register address,
#    so register r is addressed as 0xA0 | r. TRANSACTION 11 = special functions (0xE7 clears interrupts).
#  - ENABLE (0x00): bit 0 PON (oscillator on), bit 1 AEN (ALS on). Write 0x03 to start measuring, 0x00 to sleep.
#  - CONFIG/CONTROL (0x01): bits 5:4 AGAIN (00 low 1x, 01 medium 25x, 10 high 428x, 11 max 9876x),
#    bits 2:0 ATIME (000 100 ms ... 101 600 ms); bit 7 SRESET.
#  - ID (0x12) reads 0x50. STATUS (0x13) bit 0 AVALID = an integration has completed since AEN was set.
#  - C0DATAL/H (0x14/0x15, full spectrum) and C1DATAL/H (0x16/0x17, infrared) are 16-bit, low byte first;
#    read all four bytes in one auto-increment read so both channels come from the same cycle.
#  - Max count: 37888 at 100 ms, 65535 at 200-600 ms (a reading at max count means saturation).
# The datasheet gives no lux equation. lux() uses Adafruit's empirical, uncalibrated formula
# (LUX_DF = 408, coefficients 1.64 / 0.59 / 0.86, as in the Adafruit TSL2591 libraries).
import time

_CMD = 0xA0  # CMD bit + normal transaction
_ENABLE = 0x00
_CONFIG = 0x01
_ID = 0x12
_STATUS = 0x13
_C0DATAL = 0x14

_PON = 0x01
_AEN = 0x02

GAIN_LOW = 0x00   # 1x
GAIN_MED = 0x10   # 25x
GAIN_HIGH = 0x20  # 428x
GAIN_MAX = 0x30   # 9876x
_GAIN_X = {GAIN_LOW: 1.0, GAIN_MED: 25.0, GAIN_HIGH: 428.0, GAIN_MAX: 9876.0}

_LUX_DF = 408.0
_LUX_COEFB = 1.64
_LUX_COEFC = 0.59
_LUX_COEFD = 0.86


class TSL2591:
    def __init__(self, i2c, addr=0x29, gain=GAIN_MED, integration_ms=100):
        """gain: GAIN_LOW, GAIN_MED, GAIN_HIGH or GAIN_MAX.
        integration_ms: 100, 200, 300, 400, 500 or 600."""
        self.i2c = i2c
        self.addr = addr
        chip_id = self._read8(_ID)
        if chip_id != 0x50:
            raise OSError('No TSL2591 at 0x%02X (ID 0x%02X): check the wiring' % (addr, chip_id))
        self.configure(gain, integration_ms)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.addr, _CMD | reg, bytes((value & 0xFF,)))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.addr, _CMD | reg, 1)[0]

    def configure(self, gain=GAIN_MED, integration_ms=100):
        if gain not in _GAIN_X:
            raise ValueError('gain must be GAIN_LOW, GAIN_MED, GAIN_HIGH or GAIN_MAX')
        if integration_ms not in (100, 200, 300, 400, 500, 600):
            raise ValueError('integration_ms must be 100, 200, 300, 400, 500 or 600')
        self.gain = gain
        self.integration_ms = integration_ms
        atime = integration_ms // 100 - 1
        # Stop the ALS, set gain and time, then restart so AVALID marks a cycle with the new settings.
        self._write8(_ENABLE, 0x00)
        self._write8(_CONFIG, gain | atime)
        self._write8(_ENABLE, _PON | _AEN)
        self._started = time.ticks_ms()

    def _wait_valid(self):
        # One integration step is up to 108 ms per 100 ms (datasheet), then poll AVALID.
        need = self.integration_ms * 108 // 100 + 5
        wait = need - time.ticks_diff(time.ticks_ms(), self._started)
        if wait > 0:
            time.sleep_ms(wait)
        for _ in range(50):
            if self._read8(_STATUS) & 0x01:
                return
            time.sleep_ms(10)
        raise OSError('TSL2591 did not finish a measurement')

    def max_count(self):
        return 37888 if self.integration_ms == 100 else 65535

    def raw(self):
        """Return (CH0 full-spectrum counts, CH1 infrared counts) from one integration cycle."""
        self._wait_valid()
        d = self.i2c.readfrom_mem(self.addr, _CMD | _C0DATAL, 4)
        return d[0] | (d[1] << 8), d[2] | (d[3] << 8)

    def saturated(self, ch0, ch1):
        m = self.max_count()
        return ch0 >= m or ch1 >= m

    def lux(self, ch0=None, ch1=None):
        """Approximate lux (Adafruit's uncalibrated formula), or None when a channel is saturated."""
        if ch0 is None:
            ch0, ch1 = self.raw()
        if self.saturated(ch0, ch1):
            return None
        cpl = (self.integration_ms * _GAIN_X[self.gain]) / _LUX_DF
        lux1 = (ch0 - _LUX_COEFB * ch1) / cpl
        lux2 = (_LUX_COEFC * ch0 - _LUX_COEFD * ch1) / cpl
        return max(lux1, lux2, 0.0)

    def clear_interrupt(self):
        # Special function 0x07: clear ALS and no-persist ALS interrupts.
        self.i2c.writeto(self.addr, bytes((0xE7,)))

    def power_down(self):
        self._write8(_ENABLE, 0x00)

    def power_up(self):
        self._write8(_ENABLE, _PON | _AEN)
        self._started = time.ticks_ms()
