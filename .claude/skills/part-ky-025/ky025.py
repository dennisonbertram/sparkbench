# KY-025 reed switch module (reed contact + LM393 comparator, 4-pin AO/G/+/DO), MicroPython driver.
# The reed contact sits between the AO node and ground with a pull-up resistor to +, so AO is
# near + with no magnet and drops towards 0 V when a magnet closes the contact (Joy-IT: "the
# signal is inverted"). The LM393 compares AO with the trimmer voltage; its output DO has the
# module's pull-up to + and goes HIGH while a magnet is detected (LED2 lit).
# Power the module from 3.3 V on a 3.3 V board: AO and DO swing up to the supply.
from machine import ADC, Pin


class KY025:
    def __init__(self, do, ao=None, vref=3.3):
        """do: GPIO number (or Pin) wired to DO. ao: optional GPIO wired to AO (ADC pin).
        vref: ADC full scale in volts, used when read_uv() is not available (e.g. Pico)."""
        # DO is driven by the LM393 with the board's pull-up; no internal pull needed.
        self.do = Pin(do, Pin.IN) if isinstance(do, int) else do
        self.adc = None
        self.vref = vref
        if ao is not None:
            self.adc = ADC(Pin(ao) if isinstance(ao, int) else ao)
            try:
                self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V range
            except AttributeError:
                pass

    def magnet(self):
        """True while DO is HIGH: a magnet holds the reed contact closed."""
        return self.do.value() == 1

    def raw(self):
        """Logic level on DO: 1 = magnet present, 0 = no magnet."""
        return self.do.value()

    def voltage(self):
        """AO voltage in volts: close to the supply with no magnet, near 0 V with a magnet."""
        if self.adc is None:
            raise ValueError('AO pin not given')
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535
