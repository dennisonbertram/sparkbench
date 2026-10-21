# DRV8825 microstepping bipolar stepper driver (Texas Instruments DRV8825), MicroPython driver.
# Written from the TI DRV8825 datasheet (SLVSA73F) and the Pololu DRV8825 carrier (#2133) schematic.
#   STEP: each LOW->HIGH edge moves the indexer one (micro)step. Min HIGH 1.9 us, min LOW 1.9 us (tWH, tWL).
#   DIR:  direction, sampled on the STEP rising edge. Setup/hold to STEP: 650 ns (tSU, tH).
#   RST (nRESET, active low): low = indexer to Home, H-bridges off, STEP ignored. 100 kOhm pull-down in the
#         chip, so it must be driven HIGH (2.2-5.25 V) to run.
#   SLP (nSLEEP, active low): low = sleep. 1 MOhm pull-down in the chip (the board's 10 kOhm SLP-FLT resistor
#         is not a pull-up unless FLT is tied high), so it must be driven HIGH. After waking, wait 1.7 ms (tWAKE).
#   EN (nENBL, active low): high = outputs off and STEP ignored. 100 kOhm pull-down, so enabled if left open.
#         After EN goes low, wait 650 ns (tENBL) before STEP.
#   M0 M1 M2 (MODE0-2, Table 1): 000 full, 100 1/2, 010 1/4, 110 1/8, 001 1/16, 101/011/111 1/32
#         (listed M0 M1 M2). Internal 100 kOhm pull-downs, so full step if left open.
#   FLT (nFAULT): open drain via 1.5 kOhm, low on over-current or over-temperature. Cleared by pulsing RST.
# Logic inputs: high >= 2.2 V, low <= 0.7 V, so 3.3 V GPIOs drive it directly (the board has no logic supply pin).
from machine import Pin
import time

_MODES = {1: (0, 0, 0), 2: (1, 0, 0), 4: (0, 1, 0), 8: (1, 1, 0), 16: (0, 0, 1), 32: (1, 0, 1)}


class DRV8825:
    def __init__(self, step, dir, rst=None, slp=None, en=None, mode=None, flt=None):
        """step, dir: GPIO numbers wired to STEP and DIR.
        rst, slp: GPIOs wired to RST and SLP (driven high here). Both have pull-downs in the chip, so if
            you pass None you must tie that pin high yourself (e.g. RST and SLP together to one GPIO or to 3V3).
        en: GPIO wired to EN, or None (the chip's pull-down keeps the outputs enabled).
        mode: (m0, m1, m2) GPIO numbers, or None (full step via the internal pull-downs).
        flt: GPIO wired to FLT to read faults, or None."""
        self.step_pin = Pin(step, Pin.OUT, value=0)
        self.dir_pin = Pin(dir, Pin.OUT, value=0)
        self.en = Pin(en, Pin.OUT, value=0) if en is not None else None
        self.mode = [Pin(p, Pin.OUT, value=0) for p in mode] if mode is not None else None
        self.flt = Pin(flt, Pin.IN, Pin.PULL_UP) if flt is not None else None
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        self.slp = Pin(slp, Pin.OUT, value=1) if slp is not None else None
        self.position = 0
        # Leaving sleep: tWAKE is up to 1.7 ms before STEP is accepted.
        time.sleep_ms(2)

    def set_microstep(self, div):
        """div = 1, 2, 4, 8, 16 or 32 (full step ... 1/32 step). Needs mode= pins."""
        if self.mode is None:
            raise ValueError('M0-M2 not wired: board is fixed at full step')
        for p, b in zip(self.mode, _MODES[div]):
            p.value(b)
        time.sleep_us(1)  # >= 650 ns setup before the next STEP

    def direction(self, forward):
        """Set DIR (1 = forward). Takes effect on the next STEP rising edge."""
        self.dir_pin.value(1 if forward else 0)
        time.sleep_us(1)  # >= 650 ns setup before STEP

    def step(self, n, delay_us=1000):
        """Move n steps; n < 0 runs backwards. delay_us = time per step (>= 4: 1.9 us high + 1.9 us low)."""
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
        self.position += n

    def enable(self, on=True):
        """EN low = outputs on (motor holds torque); EN high = outputs off, STEP ignored."""
        if self.en is not None:
            self.en.value(0 if on else 1)
            time.sleep_us(1)  # tENBL >= 650 ns

    def disable(self):
        self.enable(False)

    def sleep(self):
        """SLP low: H-bridges, charge pump and 3.3 V regulator off (about 10 uA)."""
        if self.slp is not None:
            self.slp.value(0)

    def wake(self):
        """SLP high, then wait tWAKE (1.7 ms) before stepping."""
        if self.slp is not None:
            self.slp.value(1)
            time.sleep_ms(2)

    def reset(self):
        """Pulse RST low: indexer back to Home, clears a latched over-current fault."""
        if self.rst is not None:
            self.rst.value(0)
            time.sleep_us(10)
            self.rst.value(1)
            time.sleep_us(10)

    def fault(self):
        """True while FLT is low (over-current or over-temperature shutdown). Needs flt=."""
        return self.flt is not None and self.flt.value() == 0


def vref_for_current(amps, rsense=0.1):
    """VREF (volts, measured on the trimpot / 'ref' via) for a full-scale current limit per coil:
    ICHOP = VREF / (5 x Rsense) (datasheet equation 1). Pololu #2133 and most clones use 0.100 Ohm,
    so VREF = amps / 2. Check the sense resistors (R100 = 0.1 Ohm) on your board."""
    return 5 * amps * rsense
