# TMC2208 silent stepper motor driver (Trinamic / ADI TMC2208), MicroPython driver, STEP/DIR standalone mode.
# Written from the TMC220x/TMC222x datasheet and the BIGTREETECH TMC2208 V3.0 schematic (Watterott SilentStepStick design).
#   STEP:  each LOW->HIGH edge moves the motor one microstep (DEDGE=0, the power-up default).
#          Min HIGH and min LOW time 100 ns (tSH, tSL). No pull on the board: never leave it floating.
#   DIR:   direction, sampled on the STEP edge. Setup and hold time to STEP: 20 ns (tDSU, tDSH).
#   ENN (board pin EN, active low): high = power stage off, all motor outputs floating.
#          The BTT board pulls EN UP to VIO with 20 kOhm, so the motor stays OFF until EN is driven low.
#   MS1/MS2 (internal pull-downs): MS2 MS1 = 00 -> 1/8, 01 -> 1/2, 10 -> 1/4, 11 -> 1/16 microsteps,
#          interpolated to 1/256 inside the chip. Left open = 1/8 step (1600 pulses per turn of a 200-step motor).
#   stealthChop2 automatic tuning (AT#1): after the outputs switch on, keep the motor at standstill for
#          up to 130 ms (2^20 + 2*2^18 clocks at 12 MHz) before the first move.
# Logic HIGH must be >= 0.7 x VIO: with a 3.3 V microcontroller power VIO from 3.3 V, not 5 V.
# The chip's logic runs from its internal 5 V regulator, fed from VM: nothing moves without the motor supply.
from machine import Pin
import time

# microsteps -> (MS1, MS2), datasheet table "MS1/MS2: configuration of microstep resolution" (TMC220x)
_MODES = {2: (1, 0), 4: (0, 1), 8: (0, 0), 16: (1, 1)}

_AT1_MS = 130  # stealthChop AT#1 standstill time with the internal 12 MHz clock


class TMC2208:
    def __init__(self, step, dir, en=None, ms=None):
        """step, dir: GPIO numbers wired to STEP and DIR (both required).
        en: GPIO wired to EN. Needed on boards like the BTT V3.0 that pull EN up (outputs off): if you
            pass None, EN must be tied to GND by a wire. Starts disabled (EN high).
        ms: (ms1, ms2) GPIO numbers, or None (1/8 step through the internal pull-downs)."""
        self.step_pin = Pin(step, Pin.OUT, value=0)
        self.dir_pin = Pin(dir, Pin.OUT, value=0)
        self.en = Pin(en, Pin.OUT, value=1) if en is not None else None
        self.ms = [Pin(p, Pin.OUT, value=0) for p in ms] if ms is not None else None
        self.microsteps = 8
        self.position = 0
        self._on = en is None

    def set_microstep(self, div):
        """div = 2, 4, 8 or 16 microsteps per full step. Needs ms= pins."""
        if self.ms is None:
            raise ValueError('MS1/MS2 not wired: board is fixed at 1/8 step')
        if div not in _MODES:
            raise ValueError('microsteps must be 2, 4, 8 or 16 in STEP/DIR mode')
        for p, b in zip(self.ms, _MODES[div]):
            p.value(b)
        self.microsteps = div

    def enable(self, on=True):
        """EN low = motor outputs on (holds torque). EN high = outputs floating (shaft turns freely)."""
        if self.en is None:
            return
        self.en.value(0 if on else 1)
        if on and not self._on:
            time.sleep_ms(_AT1_MS)  # AT#1: standstill at run current before the first step
        self._on = on

    def disable(self):
        self.enable(False)

    def direction(self, forward):
        """Set DIR (1 = forward). Read by the chip on the next STEP rising edge."""
        self.dir_pin.value(1 if forward else 0)
        time.sleep_us(1)  # >= 20 ns setup before STEP

    def step(self, n, delay_us=500):
        """Send n microstep pulses; n < 0 runs backwards. delay_us = time per microstep (>= 2)."""
        if n == 0:
            return
        self.direction(n > 0)
        half = max(1, delay_us // 2)
        s = self.step_pin
        for _ in range(abs(n)):
            s.value(1)
            time.sleep_us(half)   # tSH >= 100 ns
            s.value(0)
            time.sleep_us(half)   # tSL >= 100 ns
        self.position += n

    def steps_per_rev(self, full_steps=200):
        """Microstep pulses for one shaft turn (200 full steps for a 1.8 degree motor)."""
        return full_steps * self.microsteps


def irms_from_vref(vref, rsense=0.11):
    """Standalone RMS coil current (A) set by the VREF trimpot voltage (datasheet, standalone mode):
    IRMS = 325 mV / (RSENSE + 20 mOhm) x 1/sqrt(2) x VREF / 2.5 V.
    BTT TMC2208 V3.0 and Watterott SilentStepStick use RSENSE = 0.11 Ohm."""
    return 0.325 / (rsense + 0.02) / 1.41421356 * vref / 2.5


def vref_for_current(irms, rsense=0.11):
    """VREF (volts, measured between the trimpot and GND with VM powered) for an RMS coil current."""
    v = irms * 2.5 * 1.41421356 * (rsense + 0.02) / 0.325
    if v > 2.5:
        raise ValueError('needs VREF > 2.5 V: current too high for this sense resistor')
    return v
