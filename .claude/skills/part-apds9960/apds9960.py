# APDS-9960 proximity / ambient light / RGB colour sensor (Broadcom/Avago), MicroPython driver.
# Written from the APDS-9960 datasheet (AV02-4191EN):
#  - fixed I2C address 0x39; ID register 0x92 reads 0xAB;
#  - set every control register first, then ENABLE (0x80): PON | AEN | PEN;
#    the chip needs 5.7 ms to initialise after power-on;
#  - ATIME (0x81): integration = 2.78 ms x (256 - ATIME), max count = min(65535, 1025 x (256 - ATIME));
#  - STATUS (0x93): AVALID (bit 0) when a colour cycle is done, PVALID (bit 1) when a proximity cycle is done;
#  - CDATAL..BDATAH (0x94-0x9B) are 16-bit little-endian; reading CDATAL latches all eight bytes, so read
#    them in one 8-byte transaction starting at 0x94;
#  - PDATA (0x9C) is an 8-bit proximity count (bigger = closer / more reflective).
# The gesture engine (GEN, FIFO at 0xFC-0xFF) is not used by this driver.
import time

_ENABLE = 0x80
_ATIME = 0x81
_WTIME = 0x83
_PERS = 0x8C
_CONFIG1 = 0x8D
_PPULSE = 0x8E
_CONTROL = 0x8F
_CONFIG2 = 0x90
_ID = 0x92
_STATUS = 0x93
_CDATAL = 0x94
_PDATA = 0x9C
_CONFIG3 = 0x9F
_GCONF4 = 0xAB

_PON = 0x01
_AEN = 0x02
_PEN = 0x04
_AVALID = 0x01
_PVALID = 0x02

_AGAIN = {1: 0, 4: 1, 16: 2, 64: 3}
_PGAIN = {1: 0, 2: 1, 4: 2, 8: 3}

# 0xAB is the datasheet ID; 0x9C and 0xA8 are reported by chips on many clone boards.
_IDS = (0xAB, 0x9C, 0xA8)


class APDS9960:
    def __init__(self, i2c, addr=0x39, atime=0xB6, again=4, pgain=4):
        """atime: 0xFF (2.78 ms) .. 0x00 (712 ms); default 0xB6 = 200 ms, full 0-65535 range.
        again: colour gain 1, 4, 16 or 64. pgain: proximity gain 1, 2, 4 or 8."""
        if again not in _AGAIN or pgain not in _PGAIN:
            raise ValueError('again must be 1/4/16/64, pgain 1/2/4/8')
        self.i2c = i2c
        self.addr = addr
        dev_id = self._read8(_ID)
        if dev_id not in _IDS:
            raise OSError('APDS-9960 not found (ID 0x%02X): check the wiring' % dev_id)
        self.atime = atime & 0xFF
        # Datasheet: configure everything with the engines off, then enable.
        self._write8(_ENABLE, 0x00)
        self._write8(_GCONF4, 0x00)  # gesture mode off
        self._write8(_ATIME, self.atime)
        self._write8(_WTIME, 0xFF)  # 2.78 ms wait (WEN is left off anyway)
        self._write8(_PERS, 0x00)
        self._write8(_CONFIG1, 0x60)  # reserved bits 6:5 = 1, WLONG = 0
        self._write8(_PPULSE, 0x87)  # PPLEN 16 us, 8 pulses
        # LDRIVE = 0 (100 mA), PGAIN, AGAIN
        self._write8(_CONTROL, (_PGAIN[pgain] << 2) | _AGAIN[again])
        self._write8(_CONFIG2, 0x01)  # no saturation interrupts, LED_BOOST 100 %, reserved bit 0 = 1
        self._write8(_CONFIG3, 0x00)
        self._write8(_ENABLE, _PON)
        time.sleep_ms(10)  # power-on initialise takes 5.7 ms
        self._write8(_ENABLE, _PON | _AEN | _PEN)

    def _write8(self, reg, value):
        self.i2c.writeto(self.addr, bytes((reg, value & 0xFF)))

    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes((reg,)))
        return self.i2c.readfrom(self.addr, n)

    def _read8(self, reg):
        return self._read(reg, 1)[0]

    def integration_ms(self):
        return 2.78 * (256 - self.atime)

    def max_count(self):
        return min(65535, 1025 * (256 - self.atime))

    def _wait(self, bit):
        deadline = time.ticks_add(time.ticks_ms(), int(self.integration_ms() * 2) + 100)
        while not (self._read8(_STATUS) & bit):
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('APDS-9960 timed out waiting for a reading')
            time.sleep_ms(5)

    def proximity(self):
        """8-bit proximity count, 0 (nothing) .. 255 (very close)."""
        self._wait(_PVALID)
        return self._read8(_PDATA)

    def color_raw(self):
        """Return (clear, red, green, blue) ADC counts from a completed integration."""
        self._wait(_AVALID)
        d = self._read(_CDATAL, 8)
        return (d[0] | (d[1] << 8), d[2] | (d[3] << 8), d[4] | (d[5] << 8), d[6] | (d[7] << 8))

    def saturated(self, clear):
        return clear >= self.max_count()

    def sleep(self):
        self._write8(_ENABLE, 0x00)
