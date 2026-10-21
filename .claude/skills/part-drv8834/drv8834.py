# DRV8834 low-voltage microstepping bipolar stepper driver (Texas Instruments DRV8834), MicroPython driver.
# Written from the TI DRV8834 datasheet (SLVSB19D) and the Pololu DRV8834 carrier (#2134) schematic.
# The carrier ties CONFIG high (47 kOhm to VINT), so the chip runs in indexer (STEP/DIR) mode.
#   STEP: each LOW->HIGH edge moves the indexer one (micro)step. Min HIGH 1.9 us, min LOW 1.9 us (tWH, tWL),
#         max 250 kHz. 200 kOhm pull-down in the chip.
#   DIR:  direction, latched on the STEP rising edge. Setup 200 ns, hold 1 us (tSU, tH). 200 kOhm pull-down.
#   SLP (nSLEEP, active low): low = sleep, indexer back to home. 500 kOhm pull-down in the chip, so it must be
#         driven HIGH (VIH >= 2.5 V: a 3.3 V GPIO is fine). After waking, wait tWAKE = 1 ms before STEP.
#   EN (nENBL, active low): high = output stage off (the indexer still counts STEP pulses). 200 kOhm pull-down,
#         so enabled if left open.
#   M0 (tri-level: low / high / open) and M1 (200 kOhm pull-down), Table 3, latched on each STEP rising edge:
#         M1 M0: 0 0 full, 0 1 1/2, 0 Z 1/4, 1 0 1/8, 1 1 1/16, 1 Z 1/32. Both open = 1/4 step.
#   FLT (nFAULT): open drain via 1.5 kOhm, 10 kOhm to SLP on the board. Low during over-current (auto-retry
#         after about 1.2 ms), over-temperature, under-voltage, and briefly while waking from sleep.
# There is no RESET pin: sleep (SLP low then high) returns the indexer to its home state.
from machine import Pin
import time

# step divisor -> (M1, M0); M0 = None means high impedance (pin left floating)
_MODES = {1: (0, 0), 2: (0, 1), 4: (0, None), 8: (1, 0), 16: (1, 1), 32: (1, None)}


class DRV8834:
    def __init__(self, step, dir, slp=None, en=None, m0=None, m1=None, flt=None):
        """step, dir: GPIO numbers wired to STEP and DIR.
        slp: GPIO wired to SLP (driven high here). SLP has a pull-down in the chip, so if you pass None you
            must hold it high yourself (e.g. tie FLT to 3V3: the board's 10 kOhm then pulls SLP up).
        en: GPIO wired to EN, or None (the chip's pull-down keeps the outputs enabled).
        m0, m1: GPIOs wired to M0 / M1, or None (left open: 1/4 step).
        flt: GPIO wired to FLT to read faults, or None."""
        self.step_pin = Pin(step, Pin.OUT, value=0)
        self.dir_pin = Pin(dir, Pin.OUT, value=0)
        self.en = Pin(en, Pin.OUT, value=0) if en is not None else None
        self.m0 = m0
        self.m1 = Pin(m1, Pin.OUT, value=0) if m1 is not None else None
        if m0 is not None:
            Pin(m0, Pin.IN)  # floating: 1/4 step until set_microstep() is called
        self.flt = Pin(flt, Pin.IN) if flt is not None else None
        self.slp = Pin(slp, Pin.OUT, value=1) if slp is not None else None
        self.position = 0
        time.sleep_ms(2)  # tWAKE <= 1 ms after nSLEEP goes high

    def set_microstep(self, div):
        """div = 1, 2, 4, 8, 16 or 32. Needs m0 and m1 wired (M0 must be floated for 4 and 32)."""
        if self.m0 is None or self.m1 is None:
            raise ValueError('M0/M1 not wired: board is fixed at 1/4 step')
        m1, m0 = _MODES[div]
        self.m1.value(m1)
        if m0 is None:
            Pin(self.m0, Pin.IN)               # high impedance (no pull) = Z
        else:
            Pin(self.m0, Pin.OUT, value=m0)
        time.sleep_us(1)  # >= 200 ns setup before the next STEP rising edge

    def direction(self, forward):
        """Set DIR (1 = forward). Takes effect on the next STEP rising edge."""
        self.dir_pin.value(1 if forward else 0)
        time.sleep_us(1)  # tSU >= 200 ns

    def step(self, n, delay_us=1000):
        """Move n (micro)steps; n < 0 runs backwards. delay_us = time per step (>= 4)."""
        if n == 0:
            return
        self.direction(n > 0)
        half = max(2, delay_us // 2)
        s = self.step_pin
        for _ in range(abs(n)):
            s.value(1)
            time.sleep_us(half)   # tWH >= 1.9 us
            s.value(0)
            time.sleep_us(half)   # tWL >= 1.9 us
        time.sleep_us(1)          # tH: keep DIR/M0/M1 1 us after the last rising edge
        self.position += n

    def enable(self, on=True):
        """EN low = outputs on (motor holds torque); EN high = outputs off (indexer still counts steps)."""
        if self.en is not None:
            self.en.value(0 if on else 1)

    def disable(self):
        self.enable(False)

    def sleep(self):
        """SLP low: bridges, charge pump and VINT off (a few uA); indexer resets to home."""
        if self.slp is not None:
            self.slp.value(0)

    def wake(self):
        """SLP high, then wait tWAKE (1 ms) before stepping."""
        if self.slp is not None:
            self.slp.value(1)
            time.sleep_ms(2)

    def fault(self):
        """True while FLT is low (over-current, over-temperature or under-voltage). Needs flt=."""
        return self.flt is not None and self.flt.value() == 0


def vref_for_current(amps, rsense=0.1):
    """VREF (volts on the trimpot / circled 'ref' via) for a full-scale current limit per coil:
    ITRIP = VREF / (5 x Rsense) (datasheet equation 1). The Pololu #2134 uses 0.100 Ohm sense resistors,
    so VREF = amps / 2. The chip still works with VREF below 1 V, with lower accuracy (datasheet note)."""
    return 5 * amps * rsense
