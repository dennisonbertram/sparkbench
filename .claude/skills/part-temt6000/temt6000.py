# TEMT6000X01 ambient light sensor (Vishay) on the SparkFun breakout (SEN-08688), MicroPython driver.
# The TEMT6000 is an NPN phototransistor: collector on VCC, emitter to SIG, with a 10 kOhm
# resistor (R1 on the SparkFun board) from SIG to GND. So V(SIG) = I_PCE x 10 kOhm.
# Datasheet Rev. 1.9, "Basic characteristics" (VCE = 5 V, CIE illuminant A):
#   I_PCE = 10 uA typ at 20 lx, 50 uA typ at 100 lx  ->  0.5 uA per lux (Fig. 3 is linear).
# So V(SIG) = 5 mV per lux and  E(lx) = I_PCE(uA) / 0.5 = V(SIG) / 10 kOhm / 0.5 uA.
# The output saturates near VCC - VCEsat (about 640 lx at 3.3 V). Part-to-part spread is
# large (3.5-16 uA at 20 lx), so treat lux as an estimate unless you calibrate `ua_per_lux`.
from machine import ADC, Pin


class TEMT6000:
    LOAD_OHMS = 10000.0  # SparkFun breakout R1 (10K, emitter to GND)
    UA_PER_LUX = 0.5     # datasheet typ: 50 uA at 100 lx (10 uA at 20 lx)

    def __init__(self, pin, samples=16, vref=3.3, ua_per_lux=UA_PER_LUX, load_ohms=LOAD_OHMS):
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: full 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.samples = samples
        self.vref = vref  # ADC reference used when read_uv() is not available (e.g. Pico)
        self.ua_per_lux = ua_per_lux
        self.load_ohms = load_ohms

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
        """Phototransistor current I_PCE in uA (V across the 10 kOhm load)."""
        return self.volts() / self.load_ohms * 1000000

    def lux(self):
        """Illuminance estimate in lux: E = I_PCE / 0.5 uA per lx (= 200 lx per volt)."""
        return self.microamps() / self.ua_per_lux
