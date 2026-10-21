# HX711 24-bit load-cell ADC (Avia Semiconductor), MicroPython driver.
# Written from the Avia HX711 datasheet:
# - DOUT high = conversion not ready; DOUT low = data ready.
# - 25..27 positive pulses on PD_SCK shift out 24 bits, MSB first, two's complement
#   (saturates at 0x800000 / 0x7FFFFF). Pulses 25/26/27 select the NEXT conversion:
#   25 = channel A gain 128, 26 = channel B gain 32, 27 = channel A gain 64.
# - PD_SCK high time 0.2..50 us; high for more than 60 us powers the chip down,
#   so interrupts are disabled while clocking.
# - After reset/power-up the chip uses channel A, gain 128.
from machine import Pin, disable_irq, enable_irq
import time

_PULSES = {128: 1, 32: 2, 64: 3}  # extra pulses after the 24 data bits


class HX711:
    def __init__(self, dout, pd_sck, gain=128, timeout_ms=1000):
        self.sck = Pin(pd_sck, Pin.OUT, value=0)  # low = normal operation
        self.dout = Pin(dout, Pin.IN)
        self.timeout_ms = timeout_ms
        self.offset = 0
        self.scale = 1.0
        self._extra = 1
        self.set_gain(gain)

    def set_gain(self, gain):
        """128 or 64 = channel A, 32 = channel B. Takes effect from the next conversion."""
        if gain not in _PULSES:
            raise ValueError('gain must be 128, 64 or 32')
        self.gain = gain
        changed = _PULSES[gain] != self._extra
        self._extra = _PULSES[gain]
        if changed:
            # This pulse train programs the new channel/gain; its data is from the old setting.
            # Then discard conversions for the datasheet's settling time (400 ms at 10 SPS).
            t0 = time.ticks_ms()
            self.read_raw()
            while time.ticks_diff(time.ticks_ms(), t0) < 400:
                self.read_raw()

    def is_ready(self):
        return self.dout.value() == 0

    def read_raw(self):
        """One conversion as a signed 24-bit count."""
        t0 = time.ticks_ms()
        while self.dout.value():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('HX711 not ready: check VCC, GND and the DT wire')
        sck = self.sck
        dout = self.dout
        v = 0
        irq = disable_irq()  # keep each PD_SCK high pulse well under 50 us
        try:
            for _ in range(24):
                sck.value(1)
                sck.value(0)
                v = (v << 1) | dout.value()
            for _ in range(self._extra):
                sck.value(1)
                sck.value(0)
        finally:
            enable_irq(irq)
        if v & 0x800000:
            v -= 0x1000000
        return v

    def read_average(self, n=5):
        return sum(self.read_raw() for _ in range(n)) / n

    def tare(self, n=10):
        """Remember the empty-scale reading as zero."""
        self.offset = self.read_average(n)

    def set_scale(self, counts_per_unit):
        """Counts per gram (or per whatever unit you calibrate in)."""
        self.scale = counts_per_unit

    def weight(self, n=3):
        return (self.read_average(n) - self.offset) / self.scale

    def power_down(self):
        self.sck.value(0)
        self.sck.value(1)
        time.sleep_us(80)  # > 60 us high = power down

    def power_up(self):
        self.sck.value(0)  # the chip resets to channel A, gain 128 and needs 400 ms to settle (10 SPS)
        self._extra = 1
        if self.gain == 128:
            time.sleep_ms(400)
            return
        self.set_gain(self.gain)
