# NAU7802 24-bit bridge-sensor ADC (Nuvoton), MicroPython driver.
# Follows the datasheet (rev 1.7): power-on sequence (section 9.1), register map (sections 10-11),
# internal offset calibration (section 8.6) and the 24-bit two's-complement result in 0x12-0x14.
# Full scale is +/-0.5 * VREF / gain, so 1 count = VREF / (gain * 2^24) volts. On the SparkFun
# Qwiic Scale REFP is tied to AVDD (the internal LDO) and REFN to ground, so VREF = the LDO voltage.
import time

_PU_CTRL = 0x00   # AVDDS OSCS CR CS PUR PUA PUD RR
_CTRL1 = 0x01     # CRP DRDY_SEL VLDO[2:0] GAINS[2:0]
_CTRL2 = 0x02     # CHS CRS[2:0] CAL_ERR CALS CALMOD[1:0]
_ADCO_B2 = 0x12   # conversion result, MSB first (0x12, 0x13, 0x14)
_ADC = 0x15       # ADC registers (REG_CHPS etc.)
_PGA = 0x1B
_POWER = 0x1C     # PGA_CAP_EN ...
_REV = 0x1F

_RR, _PUD, _PUA, _PUR, _CS, _CR, _AVDDS = 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x80
_CALS, _CAL_ERR = 0x04, 0x08

_LDO = {4.5: 0, 4.2: 1, 3.9: 2, 3.6: 3, 3.3: 4, 3.0: 5, 2.7: 6, 2.4: 7}
_GAIN = {1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5, 64: 6, 128: 7}
_RATE = {10: 0, 20: 1, 40: 2, 80: 3, 320: 7}


class NAU7802:
    def __init__(self, i2c, addr=0x2A, gain=128, ldo=3.0, rate=10, channel=1, calibrate=True):
        # The LDO must be at least 0.3 V below the supply (DVDD): 3.0 V suits a 3.3 V board.
        if ldo not in _LDO or gain not in _GAIN or rate not in _RATE or channel not in (1, 2):
            raise ValueError('NAU7802: unsupported ldo/gain/rate/channel')
        self.i2c = i2c
        self.addr = addr
        self.gain = gain
        self.vref = ldo
        self.rate = rate
        self.zero = 0
        self.counts_per_unit = 1.0
        # 1. RR = 1: reset all registers. 2. RR = 0, PUD = 1: normal operation.
        self._w(_PU_CTRL, _RR)
        time.sleep_ms(1)
        self._w(_PU_CTRL, _PUD)
        # 3. About 200 us later PUR reads 1.
        self._wait(_PU_CTRL, _PUR, True, 10, 'power-up (PUR) timed out: check wiring/supply')
        # 4. Configure: LDO voltage and gain, internal LDO as AVDD source, analog powered up.
        self._w(_CTRL1, (_LDO[ldo] << 3) | _GAIN[gain])
        self._w(_PU_CTRL, _AVDDS | _PUA | _PUD)
        time.sleep_ms(10)  # let the LDO and analog front end settle
        self._w(_ADC, 0x30)  # REG_CHPS = 11: CLK_CHP off (datasheet example R0x15 = 0x30)
        if channel == 1:
            # 330 pF Cfilter across VIN2P/VIN2N (fitted on the Qwiic Scale): enable it for channel 1 use.
            self._w(_POWER, self._r(_POWER) | 0x80)
        self._ctrl2 = (0x80 if channel == 2 else 0) | (_RATE[rate] << 4)
        self._w(_CTRL2, self._ctrl2)
        # 5. No conversion takes place until CS = 1.
        self._w(_PU_CTRL, _AVDDS | _CS | _PUA | _PUD)
        if calibrate:
            self.calibrate()
        # After reset/power-up wait six conversion cycles for full-accuracy data (section 8.8).
        time.sleep_ms(6 * 1000 // rate + 10)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _wait(self, reg, mask, want, timeout_ms, msg):
        t0 = time.ticks_ms()
        while bool(self._r(reg) & mask) != want:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('NAU7802 ' + msg)
            time.sleep_ms(1)

    def calibrate(self, mode=0):
        """Run a calibration (CALMOD: 0 = internal offset, 2 = system offset, 3 = system gain)."""
        self._w(_CTRL2, self._ctrl2 | _CALS | (mode & 0x03))
        # CALS stays 1 until calibration is done (several conversion periods).
        self._wait(_CTRL2, _CALS, False, 20 * 1000 // self.rate + 100, 'calibration timed out')
        if self._r(_CTRL2) & _CAL_ERR:
            raise OSError('NAU7802 calibration error (CAL_ERR)')

    def ready(self):
        """True when a new conversion result is available (CR bit)."""
        return bool(self._r(_PU_CTRL) & _CR)

    def read_raw(self, timeout_ms=1000):
        """Wait for data ready (CR) and return the signed 24-bit result."""
        self._wait(_PU_CTRL, _CR, True, timeout_ms, 'no conversion (CR) - is CS set?')
        b = self.i2c.readfrom_mem(self.addr, _ADCO_B2, 3)  # burst read latches one sample
        v = (b[0] << 16) | (b[1] << 8) | b[2]
        return v - 0x1000000 if v & 0x800000 else v

    def to_microvolts(self, raw):
        """Differential input (VINxP - VINxN) in microvolts: raw * VREF / (gain * 2^24)."""
        return raw * self.vref * 1000000 / (self.gain * 16777216)

    def read_microvolts(self):
        return self.to_microvolts(self.read_raw())

    def average(self, n=8):
        return sum(self.read_raw() for _ in range(n)) / n

    def tare(self, n=8):
        """Take the current (empty-scale) reading as zero."""
        self.zero = self.average(n)

    def calibrate_scale(self, known_weight, n=8):
        """With a known weight on the scale (after tare), set counts per unit of weight."""
        self.counts_per_unit = (self.average(n) - self.zero) / known_weight

    def weight(self, n=1):
        return (self.average(n) - self.zero) / self.counts_per_unit

    def revision(self):
        return self._r(_REV) & 0x0F
