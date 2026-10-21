# A4988 microstepping bipolar stepper driver (Allegro A4988), MicroPython driver.
# Written from the Allegro A4988 datasheet (A4988-DS) and the Pololu A4988 carrier (#1182) schematic.
#   STEP: each LOW->HIGH edge moves the motor one (micro)step. Min HIGH pulse 1 us, min LOW 1 us (tA, tB).
#   DIR:  direction, sampled on the STEP rising edge. Setup/hold time to STEP: 200 ns (tC, tD).
#   RESET (RST, active low): low = translator to Home, all FET outputs off, STEP ignored. Must be HIGH to run.
#         The Pololu board leaves RST floating: drive it high from a GPIO (rst=) or jumper it to SLP.
#   SLEEP (SLP, active low): low = sleep. Board pull-up 100 kOhm to VDD. After waking, wait 1 ms before stepping.
#   ENABLE (EN, active low): high = all FET outputs off (motor free). Board pull-down 100 kOhm, so enabled if open.
#   MS1 MS2 MS3 (Table 1): LLL full, HLL 1/2, LHL 1/4, HHL 1/8, HHH 1/16. Internal pull-downs (full step if open).
#         A new step mode takes effect on the next STEP rising edge.
# Logic HIGH must be >= 0.7 x VDD: with a 3.3 V microcontroller power VDD from 3.3 V, not 5 V.
from machine import Pin
import time

_MODES = {1: (0, 0, 0), 2: (1, 0, 0), 4: (0, 1, 0), 8: (1, 1, 0), 16: (1, 1, 1)}


class A4988:
    def __init__(self, step, dir, rst=None, slp=None, en=None, ms=None):
        """step, dir: GPIO numbers wired to STEP and DIR (both needed; neither has a pull on the board).
        rst: GPIO wired to RST, or None if RST is jumpered to SLP. Driven high here.
        slp: GPIO wired to SLP, or None (board pull-up keeps it awake).
        en: GPIO wired to EN, or None (board pull-down keeps the outputs enabled).
        ms: (ms1, ms2, ms3) GPIO numbers, or None (full step via the internal pull-downs)."""
        self.step_pin = Pin(step, Pin.OUT, value=0)
        self.dir_pin = Pin(dir, Pin.OUT, value=0)
        self.en = Pin(en, Pin.OUT, value=0) if en is not None else None
        self.slp = Pin(slp, Pin.OUT, value=1) if slp is not None else None
        self.ms = [Pin(p, Pin.OUT, value=0) for p in ms] if ms is not None else None
        self.rst = Pin(rst, Pin.OUT, value=1) if rst is not None else None
        self.position = 0
        # Leaving reset / sleep: charge pump needs 1 ms before the first STEP (datasheet, Sleep Mode).
        time.sleep_ms(1)

    def set_microstep(self, div):
        """div = 1, 2, 4, 8 or 16 (full, half, quarter, eighth, sixteenth step). Needs ms= pins."""
        if self.ms is None:
            raise ValueError('MS1-MS3 not wired: board is fixed at full step')
        bits = _MODES[div]
        for p, b in zip(self.ms, bits):
            p.value(b)

    def direction(self, forward):
        """Set DIR (1 = forward). Takes effect on the next STEP rising edge."""
        self.dir_pin.value(1 if forward else 0)
        time.sleep_us(1)  # >= 200 ns setup before STEP

    def step(self, n, delay_us=1000):
        """Move n steps; n < 0 runs backwards. delay_us = time per step (>= 2, i.e. 1 us high + 1 us low)."""
        if n == 0:
            return
        self.direction(n > 0)
        half = max(1, delay_us // 2)
        s = self.step_pin
        for _ in range(abs(n)):
            s.value(1)
            time.sleep_us(half)   # tA >= 1 us
            s.value(0)
            time.sleep_us(half)   # tB >= 1 us
        self.position += n

    def enable(self, on=True):
        """EN low = outputs on (motor holds torque); EN high = outputs off (shaft turns freely)."""
        if self.en is not None:
            self.en.value(0 if on else 1)

    def disable(self):
        self.enable(False)

    def sleep(self):
        """SLP low: outputs, regulator and charge pump off (< 10 uA)."""
        if self.slp is not None:
            self.slp.value(0)

    def wake(self):
        """SLP high, then the 1 ms charge-pump start-up before stepping."""
        if self.slp is not None:
            self.slp.value(1)
            time.sleep_ms(1)

    def reset(self):
        """Pulse RST low: translator back to Home, outputs off while low."""
        if self.rst is not None:
            self.rst.value(0)
            time.sleep_us(10)
            self.rst.value(1)
            time.sleep_ms(1)


def vref_for_current(amps, rcs=0.068):
    """VREF (volts, measured on the trimpot) for a current limit per coil: ITripMAX = VREF / (8 x Rcs).
    Pololu boards made since 2017 have Rcs = 0.068 Ohm (older green-resistor boards 0.050 Ohm).
    Clone boards often use 0.1 Ohm (R100): check the sense resistors on yours."""
    return 8 * amps * rcs
