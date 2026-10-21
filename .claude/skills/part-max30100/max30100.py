# MAX30100 pulse oximeter & heart-rate sensor (Maxim/Analog Devices), MicroPython driver.
# Register map, FIFO handling and temperature format from the MAX30100 datasheet (19-7065).
import time

_INT_STATUS = 0x00
_INT_ENABLE = 0x01
_FIFO_WR_PTR = 0x02
_OVF_COUNTER = 0x03
_FIFO_RD_PTR = 0x04
_FIFO_DATA = 0x05
_MODE_CONFIG = 0x06
_SPO2_CONFIG = 0x07
_LED_CONFIG = 0x09
_TEMP_INT = 0x16
_TEMP_FRAC = 0x17
_REV_ID = 0xFE
_PART_ID = 0xFF

MODE_HR = 0x02    # heart rate only: IR LED (red bytes of each sample read 0)
MODE_SPO2 = 0x03  # SpO2: IR and red LEDs

# SPO2_SR[2:0] -> samples per second (Table 4)
_RATES = (50, 100, 167, 200, 400, 600, 800, 1000)
# LED_PW[1:0] -> pulse width in us (Table 5); ADC resolution 13, 14, 15, 16 bits
_WIDTHS = (200, 400, 800, 1600)


class MAX30100:
    def __init__(self, i2c, addr=0x57):
        self.i2c = i2c
        self.addr = addr
        pid = self._r8(_PART_ID)
        if pid != 0x11:
            raise OSError('MAX30100 not found (part id 0x%02x): check wiring and pull-ups' % pid)
        self.reset()

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def part_id(self):
        return self._r8(_PART_ID)

    def revision(self):
        return self._r8(_REV_ID)

    def reset(self):
        """Soft reset (MODE_CONFIG RESET bit, cleared by the chip when done)."""
        self._w8(_MODE_CONFIG, 0x40)
        t0 = time.ticks_ms()
        while self._r8(_MODE_CONFIG) & 0x40:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MAX30100 reset timed out')
            time.sleep_ms(1)

    def setup(self, mode=MODE_SPO2, sample_rate=100, pulse_width=1600, ir_current=0x6, red_current=0x6):
        """Configure and start sampling. sample_rate in sps (50..1000), pulse_width in us (200/400/800/1600),
        currents are the 4-bit RED_PA / IR_PA codes of Table 6 (0x6 = 20.8 mA, 0xF = 50 mA).
        The chip lowers the rate itself if it is too high for the pulse width."""
        sr = _RATES.index(sample_rate)
        pw = _WIDTHS.index(pulse_width)
        # SPO2_HI_RES_EN (bit 6) set as the datasheet asks; bit 5 reserved = 0.
        self._w8(_SPO2_CONFIG, 0x40 | (sr << 2) | pw)
        self._w8(_LED_CONFIG, ((red_current & 0x0F) << 4) | (ir_current & 0x0F))
        self._w8(_INT_ENABLE, 0x00)
        self.clear_fifo()
        self.mode = mode
        self._w8(_MODE_CONFIG, mode & 0x07)

    def clear_fifo(self):
        """Datasheet: clear FIFO_WR_PTR, OVF_COUNTER and FIFO_RD_PTR before a new conversion."""
        self._w8(_FIFO_WR_PTR, 0)
        self._w8(_OVF_COUNTER, 0)
        self._w8(_FIFO_RD_PTR, 0)

    def shutdown(self, off=True):
        m = self._r8(_MODE_CONFIG)
        self._w8(_MODE_CONFIG, (m | 0x80) if off else (m & 0x7F))

    def available(self):
        """Unread samples in the 16-deep FIFO (16 when it overflowed)."""
        wr = self._r8(_FIFO_WR_PTR) & 0x0F
        rd = self._r8(_FIFO_RD_PTR) & 0x0F
        if self._r8(_OVF_COUNTER) & 0x0F:
            return 16
        return (wr - rd) & 0x0F

    def read_fifo(self):
        """Return a list of (ir, red) raw 16-bit words (left-justified: MSB always bit 15)."""
        n = self.available()
        if not n:
            return []
        d = self.i2c.readfrom_mem(self.addr, _FIFO_DATA, 4 * n)
        out = []
        for i in range(n):
            j = 4 * i
            out.append(((d[j] << 8) | d[j + 1], (d[j + 2] << 8) | d[j + 3]))
        return out

    def temperature(self):
        """Die temperature in C: set TEMP_EN (self-clearing, ~29 ms), then TINT (two's complement) + TFRAC/16."""
        m = self._r8(_MODE_CONFIG)
        self._w8(_MODE_CONFIG, (m & 0x87) | 0x08)
        time.sleep_ms(29)
        t0 = time.ticks_ms()
        while self._r8(_MODE_CONFIG) & 0x08:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                break
            time.sleep_ms(2)
        ti = self._r8(_TEMP_INT)
        tf = self._r8(_TEMP_FRAC) & 0x0F
        if ti > 127:
            ti -= 256
        return ti + tf * 0.0625
