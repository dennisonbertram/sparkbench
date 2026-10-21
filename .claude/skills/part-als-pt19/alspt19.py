# ALS-PT19 analog light sensor (Everlight ALS-PT19-315C/L177/TR8) on the Adafruit breakout (#2748), MicroPython driver.
# The ALS-PT19 is an NPN phototransistor: collector on VCC ("+"), emitter to OUT, and the
# Adafruit board has a 10 kOhm resistor (R1) from OUT to GND ("-"). So V(OUT) = I_PH x 10 kOhm.
# Datasheet Rev.5, "Electrical and Optical Characteristics" (VCE = 5 V, white fluorescent 6500 K):
#   I_PH1 = 15 uA typ at 100 lx, I_PH2 = 150 uA typ at 1000 lx  ->  0.15 uA per lux (Fig. 1 linear).
# So V(OUT) = 1.5 mV per lux and  E(lx) = I_PH(uA) / 0.15 = V(OUT) / 10 kOhm / 0.15 uA.
# Under incandescent light (CIE illuminant A) the current is ~3.5x higher (I_PH3 = 520 uA at 1000 lx).
# The output saturates near VCC - VCE(sat) (about 1900 lx at 3.3 V). Part-to-part spread is
# large (min 5 uA vs typ 15 uA at 100 lx), so treat lux as an estimate unless you calibrate `ua_per_lux`.
from machine import ADC, Pin


class ALSPT19:
    LOAD_OHMS = 10000.0  # Adafruit breakout R1 (10K, OUT to GND)
    UA_PER_LUX = 0.15    # datasheet typ: 15 uA at 100 lx, 150 uA at 1000 lx (fluorescent)

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
        """Average several ADC samples and return the OUT voltage in volts."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def microamps(self):
        """Phototransistor light current I_PH in uA (voltage across the 10 kOhm load)."""
        return self.volts() / self.load_ohms * 1000000

    def lux(self):
        """Illuminance estimate in lux: E = I_PH / 0.15 uA per lx (about 667 lx per volt)."""
        return self.microamps() / self.ua_per_lux
