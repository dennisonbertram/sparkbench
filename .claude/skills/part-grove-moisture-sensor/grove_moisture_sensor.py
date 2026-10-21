# Seeed Grove - Moisture Sensor v1.4 (SKU 101020008), MicroPython driver.
# Circuit (Seeed v1.4 Eagle schematic): VCC -> R1 100 Ohm -> probe fork P1; probe fork P2 -> base of an
# NPN transistor Q2 (SOT-23) whose collector is on VCC; the emitter is SIG, with R2 100 Ohm to GND.
# So the soil between the two forks feeds base current to an emitter follower: the wetter (more
# conductive) the soil, the more current flows and the HIGHER SIG goes. Dry soil or air reads about 0 V;
# SIG can never rise above about VCC - 0.7 V (the transistor's base-emitter drop).
# Seeed gives no volts-to-moisture formula, only typical 10-bit readings on a 5 V Arduino (ADC
# reference = VCC): dry soil 0-300, humid soil 300-700, in water 700-950. Those are fractions of VCC
# (29 % and 68 %), which this driver uses for its dry / moist / wet classes.
from machine import ADC, Pin


class GroveMoistureSensor:
    DRY_BELOW = 300 / 1023    # Seeed spec: dry soil 0-300 of 1023 (fraction of VCC)
    MOIST_BELOW = 700 / 1023  # humid soil 300-700, in water 700-950

    def __init__(self, pin, samples=16, vref=3.3, vcc=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.vcc = vcc    # supply on the module's VCC pin (Seeed's thresholds scale with it)

    def raw(self):
        """One 16-bit ADC reading (0-65535): higher = wetter."""
        return self.adc.read_u16()

    def volts(self):
        """Average several ADC samples and return the SIG voltage in volts (higher = wetter)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def arduino_value(self):
        """The reading Seeed's tables use: SIG as a fraction of VCC on a 0-1023 scale."""
        return round(self.volts() / self.vcc * 1023)

    def level(self):
        """'dry', 'moist' or 'wet' using Seeed's typical ranges (0-300, 300-700, 700+ of 1023)."""
        f = self.volts() / self.vcc
        if f < self.DRY_BELOW:
            return 'dry'
        if f < self.MOIST_BELOW:
            return 'moist'
        return 'wet'
