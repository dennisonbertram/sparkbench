# XGZP6847A gauge pressure sensor (CFSensor), analog version, MicroPython driver.
# Datasheet "XGZP6847A Pressure Sensor Module": supply 5 V (default model), 3 mA max,
# calibrated, temperature-compensated ratiometric output 0.5 V at 0 to 4.5 V at full scale.
#   Vout = VDD x (0.1 + 0.8 x P / FS)   ->   P = (Vout / VDD - 0.1) / 0.8 x FS
# FS is set by the model number, e.g. XGZP6847A040KPG = 0..40 kPa, 100KPG = 0..100 kPa.
# "...33" models run on 3.3 V with 0.2-2.7 V output: use vs=3.3, lo=0.2, hi=2.7.
# DIP6 pins (datasheet V2.5): 1 N/C, 2 VDD, 3 GND, 4 VDD, 5 OUT, 6 GND. Older (2019) revisions
# mark 2 and 6 N/C (leave them floating there); pins 3, 4, 5 alone are enough. Never wire pin 1.
# OUT reaches 4.5 V: on a 3.3 V board feed it through a divider and pass divider=(top+bottom)/bottom.
from machine import ADC, Pin


class XGZP6847A:
    def __init__(self, pin, fs_kpa=40.0, vs=5.0, lo=0.5, hi=4.5, pmin_kpa=0.0,
                 divider=1.0, samples=32, vref=3.3):
        """pin: ADC GPIO wired to OUT. fs_kpa: pressure at hi volts; pmin_kpa: pressure at lo volts
        (e.g. -100 for a 100KPGPN). lo/hi: output at pmin/fs with supply vs (datasheet nominal)."""
        self.adc = ADC(Pin(pin) if isinstance(pin, int) else pin)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.1 V usable
        except AttributeError:
            pass
        self.vs = vs
        self.lo = lo / vs   # output as a fraction of the supply (ratiometric)
        self.span = (hi - lo) / vs
        self.pmin = pmin_kpa
        self.fs = fs_kpa
        self.divider = divider
        self.samples = samples
        self.vref = vref

    def voltage(self):
        """Averaged voltage at the sensor's OUT pin (V)."""
        total = 0
        if hasattr(self.adc, 'read_uv'):
            for _ in range(self.samples):
                total += self.adc.read_uv() / 1000000
        else:
            for _ in range(self.samples):
                total += self.adc.read_u16() * self.vref / 65535
        return total / self.samples * self.divider

    def calibrate_zero(self):
        """Call with the port open to air (0 kPa gauge) on a 0..FS model: stores the real offset."""
        self.lo = self.voltage() / self.vs
        return self.lo * self.vs

    def pressure_kpa(self):
        """Gauge pressure in kPa (datasheet linear transfer function)."""
        return self.pmin + (self.voltage() / self.vs - self.lo) / self.span * (self.fs - self.pmin)
