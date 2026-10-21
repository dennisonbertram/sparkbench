# LTR-303 ambient light sensor (Lite-On LTR-303ALS-01, datasheet DS86-2013-0004), MicroPython driver.
# I2C address 0x29 (fixed), 8-bit registers. Two 16-bit ADC channels, LSB first:
#   CH1 (infrared) at 0x88/0x89, CH0 (visible + infrared) at 0x8A/0x8B.
# The datasheet says to read 0x88..0x8B in order (CH1 first): the four data registers are locked
# until 0x8B has been read, so both channels come from the same measurement. We read all four in one go.
# The LTR-303 adds an open-drain INT pin driven by CH0 crossing an upper/lower threshold (0x97-0x9A),
# configured in INTERRUPT (0x8F) - which must be written BEFORE the chip is put in active mode.
# Lux uses the Lite-On "Appendix A" formula (ratio = CH1 / (CH0 + CH1)), divided by gain and
# integration time in units of 100 ms.
import time

_ALS_CONTR = 0x80
_ALS_MEAS_RATE = 0x85
_PART_ID = 0x86
_MANUFAC_ID = 0x87
_ALS_DATA_CH1_0 = 0x88
_ALS_STATUS = 0x8C
_INTERRUPT = 0x8F
_THRES_UP_0 = 0x97
_THRES_LOW_0 = 0x99
_INTERRUPT_PERSIST = 0x9E

# ALS gain codes (ALS_CONTR bits 4:2); 4 and 5 are reserved
GAIN_1X = 0
GAIN_2X = 1
GAIN_4X = 2
GAIN_8X = 3
GAIN_48X = 6
GAIN_96X = 7
_GAIN_X = {0: 1, 1: 2, 2: 4, 3: 8, 6: 48, 7: 96}

# Integration time codes (ALS_MEAS_RATE bits 5:3) -> milliseconds
INT_100MS = 0
INT_50MS = 1
INT_200MS = 2
INT_400MS = 3
INT_150MS = 4
INT_250MS = 5
INT_300MS = 6
INT_350MS = 7
_INT_MS = (100, 50, 200, 400, 150, 250, 300, 350)

# Measurement repeat rate codes (ALS_MEAS_RATE bits 2:0) -> milliseconds
RATE_50MS = 0
RATE_100MS = 1
RATE_200MS = 2
RATE_500MS = 3
RATE_1000MS = 4
RATE_2000MS = 5
_RATE_MS = (50, 100, 200, 500, 1000, 2000)


class LTR303:
    def __init__(self, i2c, addr=0x29, gain=GAIN_1X, integration=INT_100MS, rate=RATE_500MS,
                 int_low=None, int_high=None, int_persist=1, int_active_high=False):
        """int_low / int_high: optional CH0 thresholds (counts). When given, the INT pin goes active
        (low by default; open drain) after int_persist (1-16) consecutive readings outside the range."""
        if gain not in _GAIN_X or integration not in range(8) or rate not in range(6):
            raise ValueError('use the GAIN_, INT_ and RATE_ constants')
        if not 1 <= int_persist <= 16:
            raise ValueError('int_persist must be 1-16')
        self.i2c = i2c
        self.addr = addr
        self.gain = gain
        self.integration = integration
        self.rate = rate
        time.sleep_ms(100)  # initial start-up time after power is applied (datasheet: 100 ms min)
        if self._r8(_PART_ID) >> 4 != 0xA or self._r8(_MANUFAC_ID) != 0x05:
            raise OSError('LTR-303 not found at 0x%02X (check the wiring)' % addr)
        # Interrupt settings must be written while in standby (datasheet note on register 0x8F).
        if int_low is not None or int_high is not None:
            lo = 0 if int_low is None else int(int_low)
            hi = 0xFFFF if int_high is None else int(int_high)
            self.i2c.writeto_mem(addr, _THRES_UP_0, bytes([hi & 0xFF, hi >> 8]))
            self.i2c.writeto_mem(addr, _THRES_LOW_0, bytes([lo & 0xFF, lo >> 8]))
            self._w8(_INTERRUPT_PERSIST, int_persist - 1)
            self._w8(_INTERRUPT, 0x02 | (0x04 if int_active_high else 0x00))  # mode on, polarity
        else:
            self._w8(_INTERRUPT, 0x00)  # INT pin inactive (high impedance)
        # Integration time must not exceed the repeat rate, or the chip clamps it to the rate.
        self._w8(_ALS_MEAS_RATE, (integration << 3) | rate)
        self._w8(_ALS_CONTR, (gain << 2) | 0x01)  # gain + active mode
        time.sleep_ms(10)  # wake-up time from standby (max 10 ms)
        self._wait_ms = 10 + max(_INT_MS[integration], _RATE_MS[rate])

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def channels(self):
        """Wait for a fresh, valid measurement and return (ch0, ch1) counts:
        ch0 = visible + infrared, ch1 = infrared only."""
        t0 = time.ticks_ms()
        while True:
            st = self._r8(_ALS_STATUS)
            if st & 0x04 and not st & 0x80:  # bit 2: new data, bit 7: data invalid
                break
            if time.ticks_diff(time.ticks_ms(), t0) > 2 * self._wait_ms + 500:
                raise OSError('LTR-303: no new data (check the wiring)')
            time.sleep_ms(10)
        d = self.i2c.readfrom_mem(self.addr, _ALS_DATA_CH1_0, 4)  # 0x88, 0x89, 0x8A, 0x8B in order
        ch1 = d[0] | (d[1] << 8)
        ch0 = d[2] | (d[3] << 8)
        return ch0, ch1

    def interrupt_active(self):
        """True while the ALS interrupt condition is met (ALS_STATUS bit 3)."""
        return bool(self._r8(_ALS_STATUS) & 0x08)

    def lux(self, ch0=None, ch1=None):
        """Illuminance in lux (Lite-On Appendix A). Returns 0 in the dark or for IR-dominated light,
        None if a channel is saturated (65535: lower the gain or integration time)."""
        if ch0 is None:
            ch0, ch1 = self.channels()
        if ch0 >= 65535 or ch1 >= 65535:
            return None
        if ch0 + ch1 == 0:
            return 0.0
        ratio = ch1 / (ch0 + ch1)
        if ratio < 0.45:
            lux = 1.7743 * ch0 + 1.1059 * ch1
        elif ratio < 0.64:
            lux = 4.2785 * ch0 - 1.9548 * ch1
        elif ratio < 0.85:
            lux = 0.5926 * ch0 + 0.1185 * ch1
        else:
            return 0.0
        return lux / _GAIN_X[self.gain] / (_INT_MS[self.integration] / 100)

    def standby(self):
        """Stop measuring (about 5 uA)."""
        self._w8(_ALS_CONTR, self.gain << 2)
