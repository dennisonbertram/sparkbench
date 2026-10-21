# MiCS-5524 CO / alcohol / VOC gas sensor, Adafruit MiCS5524 breakout (product 3199), MicroPython driver.
# Header: 5V, GND, Ao, En.
# Datasheet (SGX Sensortech 1084 rev 6) measurement circuit: the sensing resistor Rs and a load resistor
# RL form a divider from the 5 V supply, and the output is the voltage across RL:
#     Vout = Vc * RL / (Rs + RL)        so        Rs = (Vc / Vout - 1) * RL
# Reducing gases (CO, ethanol, H2, NH3, methane) lower Rs, so Ao rises with gas.
# On the Adafruit board RL = R2 = 10 kOhm (datasheet minimum 820 Ohm), and the heater runs from 5 V
# through R1 = 82 Ohm (datasheet recommended circuit, VH about 2.4 V, about 32 mA).
# Gas concentration is read from Rs/R0 on the datasheet chart, where R0 is the sensor's own resistance
# in clean air (100-1500 kOhm, it varies from part to part): calibrate R0 yourself. No ppm is invented here.
# En: a P-MOSFET (DMG3415U) switches 5 V to the sensor; a 10 kOhm pull-down keeps it ON. Pulling En up
# to 5 V turns the heater off. A 3.3 V GPIO high level does NOT reliably turn it off (gate is only
# 1.7 V below the 5 V source), so leave En unconnected unless you drive it with 5 V logic.
from machine import ADC, Pin


class MICS5524:
    def __init__(self, ao, en=None, rl=10000, vc=5.0, divider=1.0, samples=32, vref=3.3):
        """ao: GPIO number (or Pin) wired to Ao. en: optional Pin/GPIO for En, only through 5 V logic.
        rl: load resistor (10 kOhm on the Adafruit board). vc: supply voltage on 5V.
        divider: Ao / ADC-pin voltage ratio if you fitted a resistor divider, 1.0 if wired directly."""
        self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.en = None if en is None else (Pin(en, Pin.OUT, value=0) if isinstance(en, int) else en)
        self.rl = rl
        self.vc = vc
        self.divider = divider
        self.samples = samples
        self.vref = vref  # ADC full scale used when read_uv() is not available (e.g. Pico)
        self.r0 = None

    def heater(self, on):
        """Switch the sensor on (En low) or off (En high). Wait at least a second after switching on."""
        if self.en is None:
            raise ValueError('En pin not given')
        self.en.value(0 if on else 1)

    def voltage(self):
        """Ao voltage in volts, averaged over several ADC samples."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1e6
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def resistance(self):
        """Sensor resistance Rs in ohms: Rs = (Vc / Vout - 1) * RL."""
        v = self.voltage()
        if v <= 0.001:
            return float('inf')  # no reading: heater off, unpowered or Ao not wired
        return (self.vc / v - 1) * self.rl

    def calibrate(self, r0=None):
        """Store R0. With no argument, take the current Rs as R0 (in clean air, after warm-up)."""
        self.r0 = self.resistance() if r0 is None else r0
        return self.r0

    def ratio(self):
        """Rs/R0, the ordinate of the datasheet's sensitivity chart. Needs calibrate() first."""
        if not self.r0:
            raise ValueError('call calibrate() first')
        return self.resistance() / self.r0
