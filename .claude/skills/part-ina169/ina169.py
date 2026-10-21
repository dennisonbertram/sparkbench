# INA169 high-side DC current sensor (Texas Instruments), MicroPython driver.
# For the Adafruit INA169 Analog DC Current Sensor Breakout (product 1164):
#   RS = 0.1 ohm 1 % shunt between VIN+ and VIN-, RL = 10 kohm from OUT to GND.
# Datasheet (SBOS181F) equation 3: VOUT = IS x RS x 1000 uA/V x RL
#   so IS = VOUT / (RS x 0.001 A/V x RL) = VOUT / 1.0 V/A with the stock parts.
# Current flows in at VIN+ (supply side) and out at VIN- (load side); DC, one direction only.
from machine import ADC, Pin

GM = 0.001  # transconductance, 1000 uA/V (990-1010)


class INA169:
    def __init__(self, pin, rshunt=0.1, rload=10000, samples=32, vref=3.3):
        """pin: ADC GPIO wired to OUT. rshunt / rload: the board's shunt and load resistors (ohms)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable; other ports have no atten()
        except AttributeError:
            pass
        self.v_per_a = rshunt * GM * rload  # 1.0 V/A on the stock board
        self.samples = samples
        self.vref = vref  # ADC full scale when read_uv() is not available (e.g. Pico)

    def voltage(self):
        """Averaged OUT voltage (V)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples

    def current(self):
        """Current through the shunt in amperes (VIN+ to VIN-)."""
        return self.voltage() / self.v_per_a
