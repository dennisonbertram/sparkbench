# HX710B 24-bit bridge ADC (Avia Semiconductor), MicroPython driver.
# Protocol per the HX710(A/B) datasheet: DOUT high = conversion not ready; when DOUT goes low,
# give 25-27 positive PD_SCK pulses. Pulses 1-24 shift the 24-bit two's-complement result out
# MSB first (read DOUT after each rising edge); the total pulse count selects the NEXT conversion:
#   25 = differential input (INP-INN), 10 Hz
#   26 = (DVDD-AVDD) voltage difference, 40 Hz
#   27 = differential input (INP-INN), 40 Hz
# PD_SCK must stay low between reads: high for more than 60 us powers the chip down.
# Full scale: +/-0.5 * VREF / 128 V maps to 0x800000..0x7FFFFF, so 1 LSB = VREF / 2**31 V.
from machine import Pin, disable_irq, enable_irq
import time

DIFF_10HZ = 25
DVDD_AVDD_40HZ = 26
DIFF_40HZ = 27


class HX710B:
    def __init__(self, dout, sck, mode=DIFF_10HZ, vref=3.3):
        if mode not in (25, 26, 27):
            raise ValueError('mode must be 25, 26 or 27 PD_SCK pulses')
        self.sck = Pin(sck, Pin.OUT, value=0)
        self.dout = Pin(dout, Pin.IN)
        self.mode = mode
        self.vref = vref  # the module feeds VREF from VCC: pass the supply voltage you use
        self.offset = 0

    def ready(self):
        return self.dout.value() == 0

    def read_raw(self, timeout_ms=1000):
        """Wait for a conversion and return it as a signed 24-bit count."""
        t = time.ticks_ms()
        while self.dout.value():
            if time.ticks_diff(time.ticks_ms(), t) > timeout_ms:
                raise OSError('HX710B not ready: check OUT, SCK and power')
        sck = self.sck
        dout = self.dout
        v = 0
        irq = disable_irq()  # keep each PD_SCK high time well under 60 us
        try:
            for _ in range(24):
                sck.value(1)
                sck.value(0)
                v = (v << 1) | dout.value()
            for _ in range(self.mode - 24):
                sck.value(1)
                sck.value(0)
        finally:
            enable_irq(irq)
        return v - 0x1000000 if v & 0x800000 else v

    def millivolts(self, raw=None):
        """Differential input INP-INN in mV (1 LSB = VREF / 2**31)."""
        if raw is None:
            raw = self.read_raw()
        return raw * self.vref * 1000 / 2147483648

    def tare(self, samples=10):
        """Remember the current reading (e.g. port open to air) as zero."""
        s = 0
        for _ in range(samples):
            s += self.read_raw()
        self.offset = s // samples
        return self.offset

    def power_down(self):
        self.sck.value(0)
        self.sck.value(1)
        time.sleep_us(100)  # > 60 us high = power down

    def power_up(self):
        self.sck.value(0)  # chip resets; the next conversion is differential, 10 Hz
