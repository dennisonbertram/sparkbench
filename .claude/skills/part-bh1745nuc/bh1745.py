# BH1745NUC RGB + clear colour sensor (ROHM BH1745NUC), MicroPython driver.
# Written from the ROHM datasheet (TSZ02201-0M3M0F616080-1-2, Rev.002):
#   I2C address 0x38 (ADDR low) / 0x39 (ADDR high); Pimoroni board default 0x38.
#   SYSTEM_CONTROL 0x40: bit7 SW reset, bit6 INT reset, bits5:0 part ID = 0x0B.
#   MODE_CONTROL1 0x41: bits2:0 measurement time 160/320/640/1280/2560/5120 ms.
#   MODE_CONTROL2 0x42: bit7 VALID (read), bit4 RGBC_EN, bits1:0 ADC gain 1x/2x/16x.
#   MODE_CONTROL3 0x44: write 0x02.
#   Data 0x50..0x57: red, green, blue, clear, each 16-bit low byte first.
#   MANUFACTURER ID 0x92 = 0xE0.
import time

_SYSTEM_CONTROL = 0x40
_MODE_CONTROL1 = 0x41
_MODE_CONTROL2 = 0x42
_MODE_CONTROL3 = 0x44
_RED_LSB = 0x50
_INTERRUPT = 0x60
_TH_LSB = 0x62
_MANUFACTURER_ID = 0x92

_TIMES = {160: 0, 320: 1, 640: 2, 1280: 3, 2560: 4, 5120: 5}
_GAINS = {1: 0, 2: 1, 16: 2}


class BH1745:
    def __init__(self, i2c, addr=0x38, time_ms=160, gain=1):
        """time_ms: 160, 320, 640, 1280, 2560 or 5120. gain: 1, 2 or 16."""
        if time_ms not in _TIMES or gain not in _GAINS:
            raise ValueError('time_ms must be 160-5120 (powers of 2 x 160), gain 1, 2 or 16')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(2)  # datasheet: IC active 2 ms after VCC rises above 2.0 V
        part = self._r8(_SYSTEM_CONTROL) & 0x3F
        maker = self._r8(_MANUFACTURER_ID)
        if part != 0x0B or maker != 0xE0:
            raise OSError('BH1745 not found (part 0x%02X, maker 0x%02X): check the wiring' % (part, maker))
        self._w8(_SYSTEM_CONTROL, 0x80)  # software reset: all registers to defaults, power down
        time.sleep_ms(10)
        self._w8(_SYSTEM_CONTROL, 0x00)
        self.time_ms = time_ms
        self._w8(_MODE_CONTROL1, _TIMES[time_ms])
        self._w8(_MODE_CONTROL2, 0x10 | _GAINS[gain])  # RGBC_EN = 1, ADC gain
        self._w8(_MODE_CONTROL3, 0x02)  # datasheet: write 02h
        # A write to MODE_CONTROL restarts the measurement. Data update period is
        # 160 ms typ / 225 ms max at the 160 ms setting, so allow 1.5x the nominal time.
        time.sleep_ms(time_ms * 3 // 2)

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def rgbc(self):
        """Return the latest (red, green, blue, clear) counts, 0-65535 each."""
        d = self.i2c.readfrom_mem(self.addr, _RED_LSB, 8)
        return (d[0] | (d[1] << 8), d[2] | (d[3] << 8),
                d[4] | (d[5] << 8), d[6] | (d[7] << 8))

    def valid(self):
        """True once a new measurement finished since the last MODE_CONTROL write or
        the last call (reading MODE_CONTROL2 clears VALID)."""
        return bool(self._r8(_MODE_CONTROL2) & 0x80)

    def leds(self, on):
        """Pimoroni board only: its two white LEDs are switched by the INT output.
        Thresholds high=0, low=0xFFFF make the interrupt always active (INT low = LEDs on)."""
        if on:
            self.i2c.writeto_mem(self.addr, _TH_LSB, bytes([0x00, 0x00, 0xFF, 0xFF]))
            self._w8(_INTERRUPT, 0x11)  # update INT after each measurement, enable
        else:
            self._w8(_INTERRUPT, 0x00)  # INT disabled: pin high impedance
            self._w8(_SYSTEM_CONTROL, 0x40)  # INT reset

    def off(self):
        """Power down (RGBC_EN = 0)."""
        self._w8(_MODE_CONTROL2, 0x00)
