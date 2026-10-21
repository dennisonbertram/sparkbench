# Seeed Grove - GSR Sensor (v1.2, Grove pins SIG, NC, VCC, GND), MicroPython driver.
# No bus, no registers. From Seeed's v1.2 Eagle schematic (LM324 quad op-amp, TI datasheet):
#   R2/R7 4.7k + 4.7k make Vh = VCC/2.
#   Skin (finger electrodes, J1) Rs to GND under R6 200k:  V3 = Vh * Rs / (200k + Rs)   (buffered by U1C)
#   Trimmer R1 (0-200k) to GND under R5 200k:            V1 = Vh * Rp / (200k + Rp)   (buffered by U1A)
#   U1B difference amp, gain R4/R8 = R11/R10 = 2:         Vout = 2 * (V3 - V1)
#   then R9 1M + C2 100 nF (0.1 s) to SIG.
# So SIG = VCC * (Rs / (200k + Rs) - a), with a = Rp / (200k + Rp), clipped at 0 V by the single supply.
# Calibration (Seeed's procedure): electrodes NOT worn (Rs = open), turn the trimmer until SIG is lowest
# (trimmer at 200k): Vcal = VCC * (1 - a), about VCC/2. Solving both equations for Rs:
#   Rs = 200k * (V + VCC - Vcal) / (Vcal - V)
# SIG falls as skin resistance falls (more sweat = lower SIG). Output is ratiometric to VCC.
from machine import ADC, Pin
import time

R_BIAS = 200000  # R6, ohms


class GroveGSR:
    def __init__(self, sig, vcc=3.3, vref=3.3):
        """sig: GPIO number (or Pin) wired to SIG. vcc: the module's supply in volts (3.3 or 5).
        vref: ADC full scale in volts, used when read_uv() is not available (Pico: 3.3 V)."""
        self.adc = ADC(Pin(sig) if isinstance(sig, int) else sig)
        try:
            self.adc.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
        except AttributeError:
            pass
        self.vcc = vcc
        self.vref = vref
        self.vcal = vcc / 2  # ideal calibration point (trimmer fully up); replace with calibrate()

    def _volts(self):
        if hasattr(self.adc, 'read_uv'):
            return self.adc.read_uv() / 1e6
        return self.adc.read_u16() * self.vref / 65535

    def voltage(self, n=10, gap_ms=5):
        """SIG in volts, averaged over n readings gap_ms apart (Seeed's example averages 10 x 5 ms).
        The 1 Mohm / 100 nF output filter makes SIG slow (0.1 s), so do not sample it faster than needed."""
        total = 0.0
        for _ in range(n):
            total += self._volts()
            time.sleep_ms(gap_ms)
        return total / n

    def calibrate(self):
        """Call with the finger straps NOT worn, after turning the trimmer so SIG is lowest.
        Stores and returns the calibration voltage (about VCC/2)."""
        self.vcal = self.voltage(n=20)
        return self.vcal

    def resistance(self, v=None):
        """Skin resistance in ohms from SIG (schematic formula above), or None when SIG is at or above the
        calibration level (electrodes open). Returns 0 when SIG is at the 0 V floor (Rs at or below the range)."""
        if v is None:
            v = self.voltage()
        if v >= self.vcal:
            return None
        num = v + self.vcc - self.vcal
        if num <= 0:
            return 0
        return R_BIAS * num / (self.vcal - v)

    def conductance_us(self, v=None):
        """Skin conductance in microsiemens (1e6 / ohms), or None when open."""
        r = self.resistance(v)
        if r is None:
            return None
        if r == 0:
            return float('inf')
        return 1e6 / r

    def raw10(self, v=None):
        """SIG as the 0-1023 number Seeed's Arduino example prints (10-bit ADC, full scale = VCC)."""
        if v is None:
            v = self.voltage()
        return max(0, min(1023, int(v * 1023 / self.vcc + 0.5)))
