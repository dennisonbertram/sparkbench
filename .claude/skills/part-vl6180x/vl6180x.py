# VL6180X time-of-flight proximity + ambient light sensor (ST), MicroPython driver.
# Written from the ST datasheet (DocID026171 Rev 7) and application note AN4545
# (mandatory SR03 private-register settings and single-shot ranging sequence).
# Registers have 16-bit addresses, sent MSB first; multi-byte registers are big-endian.
import time

_MODEL_ID = 0x000            # reads 0xB4 on a VL6180X
_SYSTEM_MODE_GPIO1 = 0x011
_SYSTEM_INTERRUPT_CONFIG = 0x014
_SYSTEM_INTERRUPT_CLEAR = 0x015
_SYSTEM_FRESH_OUT_OF_RESET = 0x016
_SYSRANGE_START = 0x018
_SYSALS_START = 0x038
_SYSALS_ANALOGUE_GAIN = 0x03F
_SYSALS_INTEGRATION_PERIOD = 0x040
_RESULT_RANGE_STATUS = 0x04D
_RESULT_ALS_STATUS = 0x04E
_RESULT_INTERRUPT_STATUS_GPIO = 0x04F
_RESULT_ALS_VAL = 0x050
_RESULT_RANGE_VAL = 0x062

# AN4545 section 9: mandatory private registers, then recommended public ones.
_SR03 = (
    (0x0207, 0x01), (0x0208, 0x01), (0x0096, 0x00), (0x0097, 0xFD),
    (0x00E3, 0x00), (0x00E4, 0x04), (0x00E5, 0x02), (0x00E6, 0x01),
    (0x00E7, 0x03), (0x00F5, 0x02), (0x00D9, 0x05), (0x00DB, 0xCE),
    (0x00DC, 0x03), (0x00DD, 0xF8), (0x009F, 0x00), (0x00A3, 0x3C),
    (0x00B7, 0x00), (0x00BB, 0x3C), (0x00B2, 0x09), (0x00CA, 0x09),
    (0x0198, 0x01), (0x01B0, 0x17), (0x01AD, 0x00), (0x00FF, 0x05),
    (0x0100, 0x05), (0x0199, 0x05), (0x01A6, 0x1B), (0x01AC, 0x3E),
    (0x01A7, 0x1F), (0x0030, 0x00),
    (0x0011, 0x10),  # GPIO1 = interrupt output, active low
    (0x010A, 0x30),  # range averaging sample period
    (0x0031, 0xFF),  # VHV auto-calibration every 255 ranges
    (0x002E, 0x01),  # one temperature (VHV) calibration now
    (0x001B, 0x09),  # range inter-measurement period 100 ms (continuous mode)
    (0x003E, 0x31),  # ALS inter-measurement period 500 ms (continuous mode)
    (0x0014, 0x24),  # interrupts: new sample ready for range and ALS
)

# SYSALS__ANALOGUE_GAIN code (low 3 bits) -> analog gain (datasheet 6.2.35)
_GAINS = (20.0, 10.0, 5.0, 2.5, 1.67, 1.25, 1.0, 40.0)

# RESULT__RANGE_STATUS error codes, bits [7:4] (datasheet 6.2.37)
RANGE_ERRORS = {
    0: 'ok', 1: 'VCSEL continuity test', 2: 'VCSEL watchdog test', 3: 'VCSEL watchdog',
    4: 'PLL1 lock', 5: 'PLL2 lock', 6: 'early convergence estimate', 7: 'no target (max convergence)',
    8: 'no target (ignore)', 11: 'low signal-to-noise', 12: 'raw underflow', 13: 'raw overflow',
    14: 'range underflow', 15: 'range overflow',
}


class VL6180X:
    def __init__(self, i2c, addr=0x29, gain=6, integration_ms=100, timeout_ms=500):
        self.i2c = i2c
        self.addr = addr
        self.timeout_ms = timeout_ms
        self.range_error = 0
        time.sleep_ms(2)  # MCU boot after power-up / XSHUT release
        if self._r8(_MODEL_ID) != 0xB4:
            raise OSError('VL6180X not found (model ID 0x000 != 0xB4)')
        if self._r8(_SYSTEM_FRESH_OUT_OF_RESET) & 0x01:
            for reg, val in _SR03:
                self._w8(reg, val)
            self._w8(_SYSTEM_FRESH_OUT_OF_RESET, 0x00)
        self.set_als(gain, integration_ms)

    # ---- low level: 16-bit register index, MSB first ----
    def _w8(self, reg, val):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF, val & 0xFF)))

    def _w16(self, reg, val):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF, (val >> 8) & 0xFF, val & 0xFF)))

    def _rn(self, reg, n):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF)))
        return self.i2c.readfrom(self.addr, n)

    def _r8(self, reg):
        return self._rn(reg, 1)[0]

    def _r16(self, reg):
        b = self._rn(reg, 2)
        return (b[0] << 8) | b[1]

    def _wait(self, cond):
        t0 = time.ticks_ms()
        while not cond():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('VL6180X timeout')
            time.sleep_ms(1)

    # ---- configuration ----
    def set_als(self, gain=6, integration_ms=100):
        """gain: SYSALS__ANALOGUE_GAIN code 0-7 (6 = x1.0). integration_ms: 1-512 (100 recommended)."""
        gain &= 0x07
        integration_ms = max(1, min(512, int(integration_ms)))
        self._w8(_SYSALS_ANALOGUE_GAIN, 0x40 | gain)  # upper nibble must be 0x4
        self._w16(_SYSALS_INTEGRATION_PERIOD, integration_ms - 1)  # 1 code = 1 ms, 0 = 1 ms
        self._gain = _GAINS[gain]
        self._it_ms = integration_ms

    # ---- measurements ----
    def range(self):
        """Single-shot range in mm (0-255). Returns None if the sensor reports an error
        (no target, too close, too much ambient light); the code is in self.range_error."""
        self._wait(lambda: self._r8(_RESULT_RANGE_STATUS) & 0x01)  # device ready
        self._w8(_SYSRANGE_START, 0x01)
        self._wait(lambda: (self._r8(_RESULT_INTERRUPT_STATUS_GPIO) & 0x07) == 0x04)
        mm = self._r8(_RESULT_RANGE_VAL)
        self._w8(_SYSTEM_INTERRUPT_CLEAR, 0x07)
        self.range_error = self._r8(_RESULT_RANGE_STATUS) >> 4
        return None if self.range_error else mm

    def als_count(self):
        """Single-shot ambient light measurement, raw 16-bit count."""
        self._wait(lambda: self._r8(_RESULT_ALS_STATUS) & 0x01)  # device ready
        self._w8(_SYSALS_START, 0x01)
        self._wait(lambda: ((self._r8(_RESULT_INTERRUPT_STATUS_GPIO) >> 3) & 0x07) == 0x04)
        count = self._r16(_RESULT_ALS_VAL)
        self._w8(_SYSTEM_INTERRUPT_CLEAR, 0x07)
        return count

    def lux(self):
        """Ambient light in lux: 0.32 lux/count x count / gain x 100 ms / integration time
        (datasheet 2.10.4; 0.32 is the factory calibration without cover glass)."""
        return 0.32 * self.als_count() / self._gain * 100 / self._it_ms
