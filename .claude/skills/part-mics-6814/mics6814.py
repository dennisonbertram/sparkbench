# MiCS-6814 three-channel MOS gas sensor (SGX Sensortech / Amphenol), CJMCU-6814 breakout, MicroPython driver.
# Header (as printed): CO, NH3, NO2, GND, +5V.
# The CJMCU-6814 carries only the sensor and the datasheet's heater resistors (27 / 820 / 130-ish Ohm from +5V),
# so the three heaters run at about VhRED 2.4 V, VhNH3 2.2 V, VhOX 1.7 V (about 88 mA in total).
# Each sensing resistor Rs runs from its output pin to GND inside the sensor (datasheet pins B, F, J grounded).
# There are NO load resistors on the board: you add one load resistor RL from each output pin to the
# measuring supply Vc (3.3 V here, so the output can never exceed the ADC's range). Datasheet measurement circuit:
#     Vout = Vc * Rs / (Rs + RL)         so         Rs = RL * Vout / (Vc - Vout)
# RL must be at least 820 Ohm (datasheet) so the sensing layer is not damaged.
# RED (CO pin): Rs falls with CO, ethanol, H2, NH3, hydrocarbons. R0 in air 100-1500 kOhm.
# OX  (NO2 pin): Rs RISES with NO2. R0 in air 0.8-20 kOhm.
# NH3 (NH3 pin): Rs falls with NH3 (and ethanol, H2...). R0 in air 10-1500 kOhm.
# Concentrations come from Rs/R0 on the datasheet's log-log charts; R0 differs for every sensor, so calibrate
# it in clean air yourself. No ppm is invented here.
from machine import ADC, Pin


class _Channel:
    def __init__(self, pin, rl, vc, samples, vref):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.rl = rl
        self.vc = vc
        self.samples = samples
        self.vref = vref
        self.r0 = None

    def voltage(self):
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def resistance(self):
        """Rs in ohms from the datasheet divider: Rs = RL * Vout / (Vc - Vout)."""
        v = self.voltage()
        if v >= self.vc - 0.005:
            return float('inf')  # open: sensor missing, unpowered or Rs far above RL
        if v < 0:
            v = 0
        return self.rl * v / (self.vc - v)


class MICS6814:
    def __init__(self, co, nh3, no2, rl_co=100000, rl_nh3=100000, rl_no2=10000, vc=3.3, samples=32, vref=3.3):
        """co, nh3, no2: GPIO numbers (or Pins) of the CO (RED), NH3 and NO2 (OX) outputs.
        rl_*: the load resistor you fitted from each output to vc (the 3.3 V rail). vref: ADC full scale
        used when read_uv() is not available (e.g. Pico)."""
        self.red = _Channel(co, rl_co, vc, samples, vref)
        self.nh3 = _Channel(nh3, rl_nh3, vc, samples, vref)
        self.ox = _Channel(no2, rl_no2, vc, samples, vref)

    def resistances(self):
        """(Rs_RED, Rs_NH3, Rs_OX) in ohms."""
        return self.red.resistance(), self.nh3.resistance(), self.ox.resistance()

    def voltages(self):
        """(V_CO, V_NH3, V_NO2) output voltages in volts."""
        return self.red.voltage(), self.nh3.voltage(), self.ox.voltage()

    def calibrate(self):
        """Store the present Rs of each channel as R0 (do this in clean air after a long warm-up)."""
        for c in (self.red, self.nh3, self.ox):
            c.r0 = c.resistance()
        return self.red.r0, self.nh3.r0, self.ox.r0

    def ratios(self):
        """(Rs/R0 RED, NH3, OX): the ordinates of the datasheet's sensitivity charts. Needs calibrate() first."""
        out = []
        for c in (self.red, self.nh3, self.ox):
            if not c.r0:
                raise ValueError('call calibrate() first')
            out.append(c.resistance() / c.r0)
        return tuple(out)
