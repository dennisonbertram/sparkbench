# APDS-9930 digital proximity and ambient light sensor (Broadcom/Avago), MicroPython driver.
# Written from the APDS-9930 datasheet (AV02-3190EN):
#  - fixed I2C address 0x39; ID register 0x12 reads 0x39.
#  - every register access starts with a COMMAND byte: bit 7 CMD = 1, bits 6:5 TYPE
#    (00 repeated byte, 01 auto-increment, 11 special function), bits 4:0 register address.
#    This driver uses auto-increment (0xA0 | reg) for all reads and writes; 0xE7 clears interrupts.
#  - ENABLE (0x00): PON bit 0, AEN bit 1, PEN bit 2, WEN bit 3. Configure with ENABLE = 0, then enable.
#    Wait at least 4.5 ms after power-up before the first I2C command.
#  - ATIME (0x01): ALSIT = 2.73 ms x (256 - ATIME); max count = min(65535, 1023 x (256 - ATIME)).
#  - PTIME (0x02) = 0xFF recommended (proximity full scale 1023). PPULSE (0x0E): 8 pulses recommended.
#  - CONTROL (0x0F): PDRIVE b7:6 (00 = 100 mA), PDIODE b5:4 (must be 10 = Ch1 diode),
#    PGAIN b3:2 (1/2/4/8x), AGAIN b1:0 (1/8/16/120x).
#  - STATUS (0x13): AVALID bit 0, PVALID bit 1.
#  - Ch0DATA (0x14/0x15), Ch1DATA (0x16/0x17), PDATA (0x18/0x19): 16-bit, low byte first.
#  - Lux (open air): IAC = max(CH0 - 1.862 CH1, 0.746 CH0 - 1.291 CH1, 0);
#    LPC = GA x DF / (ALSIT x AGAIN) with GA = 0.49, DF = 52; lux = IAC x LPC.
import time

_ADDR = 0x39
_CMD_AUTO = 0xA0
_CMD_CLEAR_INT = 0xE7

_ENABLE = 0x00
_ATIME = 0x01
_PTIME = 0x02
_WTIME = 0x03
_PERS = 0x0C
_CONFIG = 0x0D
_PPULSE = 0x0E
_CONTROL = 0x0F
_ID = 0x12
_STATUS = 0x13
_CH0DATAL = 0x14
_PDATAL = 0x18

_PON = 0x01
_AEN = 0x02
_PEN = 0x04
_AVALID = 0x01
_PVALID = 0x02

_AGAIN = {1: 0, 8: 1, 16: 2, 120: 3}
_PGAIN = {1: 0, 2: 1, 4: 2, 8: 3}
_PDIODE_CH1 = 0x20  # datasheet: PDIODE must be 10 (Ch1 diode) for proximity to work
_PDRIVE_100MA = 0x00

# Open-air lux coefficients from the datasheet.
_GA = 0.49
_DF = 52.0
_B = 1.862
_C = 0.746
_D = 1.291

# 0x39 is the datasheet ID; some boards' chips report 0x12 (accepted by common Arduino libraries too).
_IDS = (0x39, 0x12)


class APDS9930:
    def __init__(self, i2c, addr=_ADDR, atime=0xDB, again=1, pgain=1, ppulse=8):
        """atime: 0xFF (2.73 ms) .. 0x00 (699 ms); default 0xDB = 101 ms (max count 37887).
        again: ALS gain 1, 8, 16 or 120. pgain: proximity gain 1, 2, 4 or 8.
        ppulse: IR LED pulses per proximity reading (8 recommended by the datasheet)."""
        if again not in _AGAIN or pgain not in _PGAIN:
            raise ValueError('again must be 1/8/16/120, pgain 1/2/4/8')
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(5)  # >= 4.5 ms after power-up before the first command
        dev_id = self._read8(_ID)
        if dev_id not in _IDS:
            raise OSError('APDS-9930 not found (ID 0x%02X): check the wiring' % dev_id)
        self.atime = atime & 0xFF
        self.again = again
        self._write8(_ENABLE, 0x00)  # power down while configuring
        self._write8(_ATIME, self.atime)
        self._write8(_PTIME, 0xFF)  # one 2.73 ms proximity ADC cycle, as recommended
        self._write8(_WTIME, 0xFF)
        self._write8(_PERS, 0x00)
        self._write8(_CONFIG, 0x00)  # AGL = 0, WLONG = 0, PDL = 0
        self._write8(_PPULSE, ppulse & 0xFF)
        self._write8(_CONTROL, _PDRIVE_100MA | _PDIODE_CH1 | (_PGAIN[pgain] << 2) | _AGAIN[again])
        self._write8(_ENABLE, _PON | _AEN | _PEN)
        time.sleep_ms(12)

    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.addr, _CMD_AUTO | reg, bytes((value & 0xFF,)))

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, _CMD_AUTO | reg, n)

    def _read8(self, reg):
        return self._read(reg, 1)[0]

    def integration_ms(self):
        return 2.73 * (256 - self.atime)

    def max_count(self):
        return min(65535, 1023 * (256 - self.atime))

    def _wait(self, bit):
        deadline = time.ticks_add(time.ticks_ms(), int(self.integration_ms() * 2) + 100)
        while not (self._read8(_STATUS) & bit):
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('APDS-9930 timed out waiting for a reading')
            time.sleep_ms(5)

    def raw(self):
        """(ch0, ch1) ALS counts: ch0 = visible + IR, ch1 = IR, from one integration cycle."""
        self._wait(_AVALID)
        d = self._read(_CH0DATAL, 4)
        return d[0] | (d[1] << 8), d[2] | (d[3] << 8)

    def proximity(self):
        """Proximity count, 0 .. 1023 with PTIME = 0xFF (bigger = closer)."""
        self._wait(_PVALID)
        d = self._read(_PDATAL, 2)
        return d[0] | (d[1] << 8)

    def lux(self, ch0=None, ch1=None):
        """Illuminance in lux from the datasheet's open-air equation (no cover glass)."""
        if ch0 is None or ch1 is None:
            ch0, ch1 = self.raw()
        iac = max(ch0 - _B * ch1, _C * ch0 - _D * ch1, 0)
        lpc = _GA * _DF / (self.integration_ms() * self.again)
        return iac * lpc

    def saturated(self, ch0):
        return ch0 >= self.max_count()

    def clear_interrupts(self):
        self.i2c.writeto(self.addr, bytes((_CMD_CLEAR_INT,)))

    def sleep(self):
        self._write8(_ENABLE, 0x00)
