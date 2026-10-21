# Seeed Grove - Light Sensor v1.2 (SKU 101020132), MicroPython driver.
# Circuit (Seeed schematic, LS06-S revision): LS06-S NPN phototransistor, collector to VCC,
# emitter to a 68 kOhm resistor (R1) to GND. The emitter node feeds an LM358 wired as a
# voltage follower, whose output is SIG. So V(SIG) = I_light x 68 kOhm.
# LS06-S (Senba) datasheet: light current 25 uA typ at Vdd = 5 V, Ev = 10 lux -> 2.5 uA per lux.
# So V(SIG) = 0.17 V per lux and E(lx) = I(uA) / 2.5 = V(SIG) / 68 kOhm / 2.5 uA.
# The LM358 input and output only reach VCC - 1.5 V (TI SLOS068: VICR 0 to VCC-1.5 V, VOH VCC-1.5 V),
# so the output saturates at about 1.8 V (about 10 lx) on 3.3 V and 3.5 V (about 20 lx) on 5 V.
# Normal room light saturates it: treat it as a dim-light / brighter-darker sensor, not a lux meter.
from machine import ADC, Pin


class GroveLightSensor:
    LOAD_OHMS = 68000.0  # R1 on the v1.2 board (emitter to GND)
    UA_PER_LUX = 2.5     # LS06-S typ: 25 uA at 10 lux (Vdd = 5 V)
    HEADROOM_V = 1.5     # LM358 output/input limit below VCC

    def __init__(self, pin, samples=16, vref=3.3, vcc=3.3, ua_per_lux=UA_PER_LUX, load_ohms=LOAD_OHMS):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.vcc = vcc    # supply on the module's VCC pin (sets the saturation level)
        self.ua_per_lux = ua_per_lux
        self.load_ohms = load_ohms

    def raw(self):
        """One 16-bit ADC reading (0-65535): a unitless brighter/darker value."""
        return self.adc.read_u16()

    def volts(self):
        """Average several ADC samples and return the SIG voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def microamps(self):
        """Phototransistor light current in uA (V across the 68 kOhm load)."""
        return self.volts() / self.load_ohms * 1000000

    def lux(self):
        """Illuminance estimate in lux: E = I / 2.5 uA per lx (about 5.9 lx per volt)."""
        return self.microamps() / self.ua_per_lux

    def saturated(self):
        """True when SIG is at the LM358 ceiling (VCC - 1.5 V): it is brighter than the sensor can tell."""
        return self.volts() >= self.vcc - self.HEADROOM_V - 0.05
