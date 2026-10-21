# GUVA-S12SD UV sensor (Genicom GaN Schottky photodiode) on the Adafruit #1918 analog breakout,
# MicroPython driver.
# The photodiode runs in photovoltaic mode (0 V bias) into an MCP6001 transimpedance amplifier with a
# T-network: R1 = 1 MOhm, R2 = 3.3 kOhm, R3 = 1 kOhm, so
#   Vout = Iph x (R1 + R2 + R1*R2/R3) = Iph x 4.3033 MOhm, i.e. about 4.3 V per uA (Adafruit: Vo = 4.3 x I[uA]).
# Datasheet (25 C): photocurrent 26 nA typical at 1 UVI, 113 nA under a UVA lamp at 1 mW/cm2,
# dark current under 1 nA, spectral range 240-370 nm.
# So UV index = Iph[nA] / 26 (about Vout / 0.112 V; the board silkscreen rounds this to Vout / 0.1 V).
from machine import ADC, Pin

GAIN_V_PER_UA = 4.3033   # transimpedance of the breakout, volts per microamp
NA_PER_UVI = 26.0        # datasheet typical photocurrent at UV index 1
NA_PER_MW_CM2_UVA = 113.0  # datasheet typical photocurrent for a UVA lamp at 1 mW/cm2


class GUVAS12SD:
    def __init__(self, pin, samples=32, vref=3.3):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """OUT voltage in volts, averaged over several ADC samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def photocurrent(self):
        """Photodiode current in nA: Iph = Vout / 4.3033 V per uA."""
        return self.voltage() / GAIN_V_PER_UA * 1000

    def uv_index(self):
        """UV index from the datasheet's typical 26 nA per UVI (sunlight; +/- tolerance per sensor)."""
        return self.photocurrent() / NA_PER_UVI

    def uva_mw_cm2(self):
        """UVA irradiance in mW/cm2 for a UVA lamp source (datasheet: 113 nA at 1 mW/cm2)."""
        return self.photocurrent() / NA_PER_MW_CM2_UVA
