# LTR-559 ambient light + proximity sensor (Lite-On LTR-559ALS-01, datasheet DS86-2013-0003), MicroPython driver.
# I2C address 0x23 (fixed), 8-bit registers. PART_ID 0x86 = 0x92, MANUFAC_ID 0x87 = 0x05.
# ALS: two 16-bit channels, LSB first: CH1 (infrared) at 0x88/0x89, CH0 (visible + infrared) at 0x8A/0x8B.
#   Read 0x88..0x8B in that order (CH1 first): the four registers stay locked until 0x8B is read.
# PS: 11-bit count, PS_DATA_0 0x8D = bits 7:0, PS_DATA_1 0x8E bits 2:0 = bits 10:8, bit 7 = saturated.
# Lux: Lite-On Appendix A formula (ratio = CH1 / (CH0 + CH1)), divided by gain and integration time / 100 ms.
import time

_ALS_CONTR = 0x80
_PS_CONTR = 0x81
_PS_LED = 0x82
_PS_N_PULSES = 0x83
_PS_MEAS_RATE = 0x84
_ALS_MEAS_RATE = 0x85
_PART_ID = 0x86
_MANUFAC_ID = 0x87
_ALS_DATA_CH1_0 = 0x88
_STATUS = 0x8C
_PS_DATA_0 = 0x8D

# ALS gain codes (ALS_CONTR bits 4:2); 4 and 5 are reserved
GAIN_1X = 0
GAIN_2X = 1
GAIN_4X = 2
GAIN_8X = 3
GAIN_48X = 6
GAIN_96X = 7
_GAIN_X = {0: 1, 1: 2, 2: 4, 3: 8, 6: 48, 7: 96}

# ALS integration time codes (ALS_MEAS_RATE bits 5:3) -> ms
INT_100MS = 0
INT_50MS = 1
INT_200MS = 2
INT_400MS = 3
INT_150MS = 4
INT_250MS = 5
INT_300MS = 6
INT_350MS = 7
_INT_MS = (100, 50, 200, 400, 150, 250, 300, 350)

# ALS repeat rate codes (ALS_MEAS_RATE bits 2:0) -> ms
RATE_50MS = 0
RATE_100MS = 1
RATE_200MS = 2
RATE_500MS = 3
RATE_1000MS = 4
RATE_2000MS = 5
_RATE_MS = (50, 100, 200, 500, 1000, 2000)

# PS LED peak current codes (PS_LED bits 2:0)
LED_5MA = 0
LED_10MA = 1
LED_20MA = 2
LED_50MA = 3
LED_100MA = 4

# PS repeat rate codes (PS_MEAS_RATE bits 3:0) -> ms
PS_RATE_MS = {0: 50, 1: 70, 2: 100, 3: 200, 4: 500, 5: 1000, 6: 2000, 8: 10}


class LTR559:
    def __init__(self, i2c, addr=0x23, gain=GAIN_1X, integration=INT_100MS, rate=RATE_500MS,
                 led_current=LED_50MA, pulses=1, ps_rate=2):
        if gain not in _GAIN_X or integration not in range(8) or rate not in range(6):
            raise ValueError('use the GAIN_, INT_ and RATE_ constants')
        if led_current not in range(5) or not 1 <= pulses <= 15 or ps_rate not in PS_RATE_MS:
            raise ValueError('bad proximity settings')
        self.i2c = i2c
        self.addr = addr
        self.gain = gain
        self.integration = integration
        time.sleep_ms(100)  # initial start-up time after power is applied (datasheet: 100 ms)
        if self._r8(_PART_ID) != 0x92 or self._r8(_MANUFAC_ID) != 0x05:
            raise OSError('LTR-559 not found at 0x%02X (check the wiring)' % addr)
        # Software reset (ALS_CONTR bit 1); the bit reads back 0 once the start-up procedure is done.
        self._w8(_ALS_CONTR, 0x02)
        t0 = time.ticks_ms()
        while self._r8(_ALS_CONTR) & 0x02:
            if time.ticks_diff(time.ticks_ms(), t0) > 1000:
                raise OSError('LTR-559: software reset timed out')
            time.sleep_ms(10)
        # (An INTERRUPT 0x8F setting would have to be written here, before active mode; default 0 = INT off.)
        # PS LED: 60 kHz, 100 % duty (bits 7:3 = 0b01111, datasheet default) with the chosen peak current.
        self._w8(_PS_LED, 0x78 | led_current)
        self._w8(_PS_N_PULSES, pulses)
        self._w8(_PS_MEAS_RATE, ps_rate)
        # Integration time must not exceed the repeat rate, or the chip raises the rate to match.
        self._w8(_ALS_MEAS_RATE, (integration << 3) | rate)
        self._w8(_ALS_CONTR, (gain << 2) | 0x01)  # gain + ALS active
        self._w8(_PS_CONTR, 0x23)  # saturation indicator enable + PS active
        time.sleep_ms(10)  # wake-up time from standby (max 10 ms)
        self._als_wait = 10 + max(_INT_MS[integration], _RATE_MS[rate])
        self._ps_wait = 10 + PS_RATE_MS[ps_rate]

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def _wait(self, mask, ms):
        t0 = time.ticks_ms()
        while True:
            st = self._r8(_STATUS)
            if st & mask and not st & 0x80:  # new data, and bit 7 (ALS data invalid) clear
                return
            if time.ticks_diff(time.ticks_ms(), t0) > 2 * ms + 500:
                raise OSError('LTR-559: no new data (check the wiring)')
            time.sleep_ms(10)

    def channels(self):
        """Wait for a fresh ALS result and return (ch0, ch1): ch0 = visible + IR, ch1 = IR only."""
        self._wait(0x04, self._als_wait)
        d = self.i2c.readfrom_mem(self.addr, _ALS_DATA_CH1_0, 4)  # 0x88, 0x89, 0x8A, 0x8B in order
        return d[2] | (d[3] << 8), d[0] | (d[1] << 8)

    def lux(self, ch0=None, ch1=None):
        """Illuminance in lux (Lite-On Appendix A). 0 in the dark or for IR-dominated light,
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

    def proximity(self):
        """Wait for a fresh PS result and return the 11-bit count (0-2047, higher = closer),
        or None if the PS saturation flag is set."""
        self._wait(0x01, self._ps_wait)
        d = self.i2c.readfrom_mem(self.addr, _PS_DATA_0, 2)
        if d[1] & 0x80:
            return None
        return d[0] | ((d[1] & 0x07) << 8)

    def standby(self):
        """Stop both measurements (about 5 uA)."""
        self._w8(_ALS_CONTR, self.gain << 2)
        self._w8(_PS_CONTR, 0x00)
