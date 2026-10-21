# MAX30105 particle / heart-rate sensor (Maxim MAX30105), MicroPython driver.
# Register map, FIFO handling and die-temperature readout follow the Maxim MAX30105 datasheet (Rev 1):
# 32-sample FIFO of 3-byte, left-justified 18-bit values per active LED, read by burst-reading FIFO_DATA (0x07).
import time

_INT_STAT1 = 0x00
_INT_STAT2 = 0x01
_FIFO_WR_PTR = 0x04
_OVF_COUNTER = 0x05
_FIFO_RD_PTR = 0x06
_FIFO_DATA = 0x07
_FIFO_CONFIG = 0x08
_MODE_CONFIG = 0x09
_SPO2_CONFIG = 0x0A  # "particle-sensing configuration"
_LED1_PA = 0x0C  # red
_LED2_PA = 0x0D  # IR
_LED3_PA = 0x0E  # green
_PILOT_PA = 0x10
_SLOT12 = 0x11
_SLOT34 = 0x12
_TINT = 0x1F
_TFRAC = 0x20
_TEMP_CONFIG = 0x21
_REV_ID = 0xFE
_PART_ID = 0xFF

PART_ID = 0x15

_RATES = (50, 100, 200, 400, 800, 1000, 1600, 3200)
_PULSE_WIDTHS = (69, 118, 215, 411)  # us -> 15, 16, 17, 18-bit ADC
_ADC_RANGES = (2048, 4096, 8192, 16384)  # nA full scale
_AVERAGES = (1, 2, 4, 8, 16, 32)

# MODE[2:0]: 0b010 red only, 0b011 red + IR, 0b111 multi-LED (slots below)
MODE_RED = 0x02
MODE_RED_IR = 0x03
MODE_MULTI = 0x07


class MAX30105:
    def __init__(self, i2c, addr=0x57):
        self.i2c = i2c
        self.addr = addr
        pid = self._r8(_PART_ID)
        if pid != PART_ID:
            raise OSError('MAX30105 not found (part id 0x%02x, expected 0x15): check the wiring' % pid)
        self.channels = 0

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def revision(self):
        return self._r8(_REV_ID)

    def reset(self):
        """Soft reset (MODE_CONFIG bit 6); the bit clears itself when the reset is done."""
        self._w8(_MODE_CONFIG, 0x40)
        t0 = time.ticks_ms()
        while self._r8(_MODE_CONFIG) & 0x40:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MAX30105 reset did not finish')
            time.sleep_ms(1)
        self.channels = 0

    def setup(self, leds=3, led_current=0x1F, sample_rate=100, pulse_width=411, adc_range=4096, average=4):
        """Configure and start sampling.
        leds: 1 = red only, 2 = red + IR, 3 = red + IR + green (multi-LED, slots 1-3 = red, IR, green).
        led_current: LEDx_PA code, 0x00-0xFF = 0-50 mA (0x1F = 6.4 mA).
        sample_rate (sps), pulse_width (us: 69/118/215/411 -> 15-18 bit), adc_range (nA), average (samples)."""
        self.reset()
        avg = _AVERAGES.index(average)
        # SMP_AVE[7:5], FIFO_ROLLOVER_EN (bit 4) so the FIFO keeps the newest samples, FIFO_A_FULL = 0x0F (17 samples)
        self._w8(_FIFO_CONFIG, (avg << 5) | 0x10 | 0x0F)
        cfg = (_ADC_RANGES.index(adc_range) << 5) | (_RATES.index(sample_rate) << 2) | _PULSE_WIDTHS.index(pulse_width)
        self._w8(_SPO2_CONFIG, cfg)
        for reg in (_LED1_PA, _LED2_PA, _LED3_PA, _PILOT_PA):
            self._w8(reg, led_current)
        if leds == 3:
            self._w8(_SLOT12, (0x02 << 4) | 0x01)  # SLOT1 = LED1 red, SLOT2 = LED2 IR
            self._w8(_SLOT34, 0x03)  # SLOT3 = LED3 green, SLOT4 off
            mode = MODE_MULTI
        elif leds == 2:
            mode = MODE_RED_IR
        else:
            leds = 1
            mode = MODE_RED
        self.clear_fifo()
        self.channels = leds
        self._w8(_MODE_CONFIG, mode)

    def clear_fifo(self):
        """Datasheet: clear FIFO_WR_PTR, OVF_COUNTER and FIFO_RD_PTR before starting."""
        self._w8(_FIFO_WR_PTR, 0)
        self._w8(_OVF_COUNTER, 0)
        self._w8(_FIFO_RD_PTR, 0)

    def shutdown(self, off=True):
        m = self._r8(_MODE_CONFIG)
        self._w8(_MODE_CONFIG, (m | 0x80) if off else (m & 0x7F))

    def available(self):
        """Unread samples in the FIFO (pointer wrap-around taken into account)."""
        n = (self._r8(_FIFO_WR_PTR) - self._r8(_FIFO_RD_PTR)) & 0x1F
        if n == 0 and self._r8(_OVF_COUNTER):
            n = 32  # full: pointers equal and samples were lost
        return n

    def read_fifo(self):
        """Pop every unread sample: a list of tuples (red[, ir[, green]]) in raw 18-bit ADC counts."""
        if not self.channels:
            raise OSError('call setup() first')
        n = self.available()
        out = []
        if not n:
            return out
        per = 3 * self.channels
        d = self.i2c.readfrom_mem(self.addr, _FIFO_DATA, n * per)
        for i in range(n):
            s = []
            for c in range(self.channels):
                o = i * per + 3 * c
                s.append(((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]) & 0x3FFFF)
            out.append(tuple(s))
        return out

    def read(self, timeout_ms=1000):
        """Wait for data and return the newest sample (red[, ir[, green]])."""
        t0 = time.ticks_ms()
        while True:
            s = self.read_fifo()
            if s:
                return s[-1]
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('MAX30105: no samples (is it set up and powered?)')
            time.sleep_ms(5)

    def temperature(self):
        """Die temperature in degC: TINT (two's complement) + TFRAC x 0.0625 (conversion about 29 ms)."""
        self._w8(_TEMP_CONFIG, 0x01)  # TEMP_EN, self-clearing
        t0 = time.ticks_ms()
        while self._r8(_TEMP_CONFIG) & 0x01 and not (self._r8(_INT_STAT2) & 0x02):
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                break
            time.sleep_ms(2)
        ti = self._r8(_TINT)
        if ti > 127:
            ti -= 256
        tf = self._r8(_TFRAC) & 0x0F  # reading TFRAC clears DIE_TEMP_RDY
        return ti + tf * 0.0625
