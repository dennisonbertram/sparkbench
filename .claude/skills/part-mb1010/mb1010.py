# MaxBotix LV-MaxSonar-EZ1 (MB1010) ultrasonic rangefinder, MicroPython driver (analog output AN).
# Datasheet (LV-MaxSonar-EZ Series, PD11832i): pin 3 AN "outputs analog voltage with a scaling factor of
# (Vcc/512) per inch" (about 9.8 mV/in at 5 V, 6.4 mV/in at 3.3 V), buffered, holding the most recent range.
# So: range (inches) = V_AN / (Vcc / 512) = V_AN * 512 / Vcc. Reports 6 to 254 inches with 1-inch resolution;
# targets closer than 6 inches read as 6 inches. A new reading every 49 ms in free-run mode (RX open/high);
# the first reading is ready about 250 ms + 100 ms after power-up (calibration cycle).
# Pass vcc = the voltage actually on the sensor's +5 pin (3.3 if it is powered from the 3V3 pin).
import time
from machine import ADC, Pin

CM_PER_INCH = 2.54


class MB1010:
    MIN_IN = 6
    MAX_IN = 254

    def __init__(self, pin, vcc=3.3, samples=8, vref=3.3):
        """pin: GPIO number (or Pin) wired to AN. vcc: sensor supply in volts (sets the scale).
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """Averaged AN voltage in volts."""
        total = 0
        for _ in range(self.samples):
            if hasattr(self.adc, 'read_uv'):
                total += self.adc.read_uv() / 1e6
            else:
                total += self.adc.read_u16() * self.vref / 65535
            time.sleep_us(200)
        return total / self.samples

    def inches(self):
        """Range in inches (datasheet scale Vcc/512 per inch), clamped to the 6-254 in reporting range."""
        d = self.voltage() * 512 / self.vcc
        return min(max(d, self.MIN_IN), self.MAX_IN)

    def cm(self):
        """Range in centimetres."""
        return self.inches() * CM_PER_INCH
