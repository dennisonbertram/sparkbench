# MAX44009 ambient light sensor (Maxim 19-5719 Rev 0), MicroPython driver.
# 8-bit registers: 0x00 interrupt status, 0x01 interrupt enable, 0x02 configuration
# (CONT bit 7, MANUAL bit 6, CDR bit 3, TIM[2:0]; power-on 0x03), 0x03 lux high byte
# (E3..E0 M7..M4), 0x04 lux low byte (bits 3..0 = M3..M0), 0x05/0x06 upper/lower
# threshold, 0x07 threshold timer.
#   Full resolution:  lux = 2**E * M[7:0] * 0.045
#   High byte only:   lux = 2**E * M[7:4] * 0.72
# Exponent 15 (0b1111) means overrange.
# The datasheet requires a Repeated START (no STOP) between reading 0x03 and 0x04 so
# both bytes come from the same conversion (Figure 8).
import time

_REG_INT_STATUS = 0x00
_REG_INT_ENABLE = 0x01
_REG_CONFIG = 0x02
_REG_LUX_HIGH = 0x03
_REG_LUX_LOW = 0x04
_REG_THRESH_HIGH = 0x05
_REG_THRESH_LOW = 0x06
_REG_THRESH_TIMER = 0x07

_CONT = 0x80    # continuous conversions (otherwise one every 800 ms)
_MANUAL = 0x40  # manual CDR/TIM; 0 = automatic ranging (power-up default)
_CDR = 0x08     # divide the photodiode current by 8 (manual mode)

ADDR_A0_GND = 0x4A
ADDR_A0_VCC = 0x4B

# TIM[2:0] -> integration time in ms (Table 7)
_TIM_MS = (800, 400, 200, 100, 50, 25, 12.5, 6.25)


class MAX44009:
    def __init__(self, i2c, addr=ADDR_A0_GND, continuous=False, manual=None):
        """addr 0x4A (A0 to GND) or 0x4B (A0 to VCC).
        continuous=False: default mode, one measurement every 800 ms (lowest current).
        manual=None keeps automatic ranging; manual=(cdr, tim) with cdr 0/1 and tim 0-7
        sets the current divider and integration time yourself (Table 9)."""
        self.i2c = i2c
        self.addr = addr
        cfg = _CONT if continuous else 0
        if manual is not None:
            cdr, tim = manual
            if not (0 <= tim <= 7) or cdr not in (0, 1):
                raise ValueError('manual=(cdr 0/1, tim 0-7)')
            cfg |= _MANUAL | (_CDR if cdr else 0) | tim
        self._write(_REG_CONFIG, cfg)
        # The first result is ready after one measurement cycle (800 ms in default mode).
        time.sleep_ms(820)

    def _write(self, reg, value):
        self.i2c.writeto(self.addr, bytes((reg, value & 0xFF)))

    def _read(self, reg):
        self.i2c.writeto(self.addr, bytes((reg,)), False)
        return self.i2c.readfrom(self.addr, 1)[0]

    def raw(self):
        """(exponent, mantissa 0-255) from registers 0x03 and 0x04, read with a Repeated
        START between them so the chip does not update the result in between."""
        self.i2c.writeto(self.addr, bytes((_REG_LUX_HIGH,)), False)
        hi = self.i2c.readfrom(self.addr, 1, False)[0]
        self.i2c.writeto(self.addr, bytes((_REG_LUX_LOW,)), False)
        lo = self.i2c.readfrom(self.addr, 1)[0]
        return hi >> 4, ((hi & 0x0F) << 4) | (lo & 0x0F)

    def lux(self):
        """Ambient light in lux at full resolution (0.045 lux LSB at the lowest range)."""
        e, m = self.raw()
        if e == 0x0F:
            raise OSError('MAX44009 overrange (exponent 15)')
        return (1 << e) * m * 0.045

    def lux_high_byte(self):
        """Coarser reading from register 0x03 only (0.72 lux LSB at the lowest range)."""
        hi = self._read(_REG_LUX_HIGH)
        e = hi >> 4
        if e == 0x0F:
            raise OSError('MAX44009 overrange (exponent 15)')
        return (1 << e) * (hi & 0x0F) * 0.72

    def config(self):
        """Configuration register; in automatic mode CDR and TIM show the chosen range."""
        return self._read(_REG_CONFIG)

    def integration_ms(self):
        return _TIM_MS[self.config() & 0x07]

    def interrupt_status(self):
        """1 if the light stayed outside the threshold window (reading clears it)."""
        return self._read(_REG_INT_STATUS) & 0x01

    def set_interrupt(self, enable):
        self._write(_REG_INT_ENABLE, 1 if enable else 0)

    def set_thresholds(self, upper_byte, lower_byte, timer_100ms=0):
        """Threshold registers in the lux-high-byte format EEEE MMMM (datasheet
        'Threshold Register Data Format'); timer in steps of 100 ms."""
        self._write(_REG_THRESH_HIGH, upper_byte)
        self._write(_REG_THRESH_LOW, lower_byte)
        self._write(_REG_THRESH_TIMER, timer_100ms)
