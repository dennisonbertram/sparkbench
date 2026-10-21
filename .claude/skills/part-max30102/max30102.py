# MAX30102 pulse oximeter & heart-rate sensor (Analog Devices / Maxim MAX30102), MicroPython driver.
# Written from the datasheet (19-7740 Rev 1): I2C address 0x57, PART_ID 0x15 at 0xFF, 32-sample FIFO with
# 3 bytes per LED channel (18-bit, left-justified: MSB always at bit 17), Red first then IR in SpO2 mode.
import time

_INT_STATUS1 = 0x00
_FIFO_WR_PTR = 0x04
_OVF_COUNTER = 0x05
_FIFO_RD_PTR = 0x06
_FIFO_DATA = 0x07
_FIFO_CONFIG = 0x08
_MODE_CONFIG = 0x09
_SPO2_CONFIG = 0x0A
_LED1_PA = 0x0C  # red
_LED2_PA = 0x0D  # IR
_TEMP_INT = 0x1F
_TEMP_FRAC = 0x20
_TEMP_CONFIG = 0x21
_PART_ID = 0xFF

_RATES = (50, 100, 200, 400, 800, 1000, 1600, 3200)  # SPO2_SR[2:0], samples per second
_WIDTHS = (69, 118, 215, 411)  # LED_PW[1:0], us -> 15, 16, 17, 18-bit ADC
_RANGES = (2048, 4096, 8192, 16384)  # SPO2_ADC_RGE[1:0], full scale in nA
_AVERAGES = (1, 2, 4, 8, 16, 32)  # SMP_AVE[2:0]


class MAX30102:
    def __init__(self, i2c, addr=0x57):
        self.i2c = i2c
        self.addr = addr
        pid = self._r8(_PART_ID)
        if pid != 0x15:
            raise OSError('MAX30102 not found (part ID 0x%02x, expected 0x15)' % pid)
        self.channels = 0
        self.reset()

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def reset(self):
        """Soft reset: every register back to its power-on value; RESET clears itself when done."""
        self._w8(_MODE_CONFIG, 0x40)
        t0 = time.ticks_ms()
        while self._r8(_MODE_CONFIG) & 0x40:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MAX30102 reset did not complete')
            time.sleep_ms(1)
        self._r8(_INT_STATUS1)  # clear any pending interrupt (PWR_RDY)
        self.channels = 0

    def setup(self, mode='spo2', sample_rate=100, average=1, pulse_width=411, adc_range=4096,
              red_ma=7.0, ir_ma=7.0, rollover=True):
        """Start sampling. mode 'spo2' = Red + IR, 'hr' = Red only.
        The FIFO receives sample_rate / average samples per second. If the pulse width is too long for the
        sample rate (datasheet Tables 11/12) the chip programs the highest rate it can instead."""
        sr = _RATES.index(sample_rate)
        pw = _WIDTHS.index(pulse_width)
        rg = _RANGES.index(adc_range)
        av = _AVERAGES.index(average)
        self._w8(_FIFO_CONFIG, (av << 5) | (0x10 if rollover else 0))
        self._w8(_SPO2_CONFIG, (rg << 5) | (sr << 2) | pw)
        # LED current: 0.2 mA per LSB (0x00 = off ... 0xFF = 51 mA)
        self._w8(_LED1_PA, min(255, max(0, round(red_ma / 0.2))))
        self._w8(_LED2_PA, min(255, max(0, round(ir_ma / 0.2))))
        if mode == 'spo2':
            self._w8(_MODE_CONFIG, 0x03)
            self.channels = 2
        elif mode == 'hr':
            self._w8(_MODE_CONFIG, 0x02)
            self.channels = 1
        else:
            raise ValueError("mode must be 'spo2' or 'hr'")
        # Datasheet: clear FIFO_WR_PTR, OVF_COUNTER and FIFO_RD_PTR when starting a conversion
        # (the write pointer is only writable once MODE is 010/011/111).
        self._w8(_FIFO_WR_PTR, 0)
        self._w8(_OVF_COUNTER, 0)
        self._w8(_FIFO_RD_PTR, 0)

    def available(self):
        """Unread samples in the FIFO (0-32)."""
        wr, ovf, rd = self.i2c.readfrom_mem(self.addr, _FIFO_WR_PTR, 3)
        n = (wr - rd) & 0x1F
        if n == 0 and ovf:
            n = 32  # full: pointers are equal but samples were lost
        return n

    def read_fifo(self):
        """Read every unread sample. Returns a list of (red, ir) in SpO2 mode or (red,) in HR mode,
        each an 18-bit ADC count (left-justified, so lower resolutions read with their low bits 0)."""
        if not self.channels:
            return []
        n = self.available()
        out = []
        if not n:
            return out
        per = 3 * self.channels
        d = self.i2c.readfrom_mem(self.addr, _FIFO_DATA, n * per)  # FIFO_DATA does not auto-increment
        for i in range(n):
            s = []
            for c in range(self.channels):
                j = i * per + 3 * c
                s.append(((d[j] << 16) | (d[j + 1] << 8) | d[j + 2]) & 0x3FFFF)
            out.append(tuple(s))
        return out

    def temperature(self):
        """Die temperature in degC (0.0625 degC resolution, about 29 ms per conversion)."""
        self._w8(_TEMP_CONFIG, 0x01)  # TEMP_EN, clears itself when the conversion is done
        t0 = time.ticks_ms()
        while self._r8(_TEMP_CONFIG) & 0x01:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MAX30102 temperature conversion timed out')
            time.sleep_ms(2)
        tint = self._r8(_TEMP_INT)
        if tint > 127:
            tint -= 256  # two's complement, 1 degC per bit
        tfrac = self._r8(_TEMP_FRAC) & 0x0F  # always adds, 0.0625 degC per bit
        return tint + tfrac * 0.0625

    def shutdown(self):
        self._w8(_MODE_CONFIG, self._r8(_MODE_CONFIG) | 0x80)

    def wake(self):
        self._w8(_MODE_CONFIG, self._r8(_MODE_CONFIG) & 0x7F)
