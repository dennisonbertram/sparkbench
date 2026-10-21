# SparkFun Sound Detector (SEN-12642 / SEN-14262 with headers, header JP1 pins 1-5: GND, VCC, GATE, ENVELOPE, AUDIO),
# MicroPython driver.
# No bus, no registers. From SparkFun's v11 schematic: an electret capsule (biased through 2.2k from VCC) feeds
# IC1G1, an LMV324 inverting preamp (gain R3/R2 = 100k/1k = 100) referenced to VCC/2 (R5/R6 10k/10k), so:
#   AUDIO    - the audio waveform riding on VCC/2 (2.5 V on 5 V), DC coupled, through 100 ohm (R19).
#   ENVELOPE - precision rectifier + peak hold (C1 10 uF, R9 10k) + buffer: 0 V in silence, rises with loudness,
#              through 100 ohm (R18).
#   GATE     - Schmitt trigger on the envelope: LOW when quiet, HIGH while sound is present, through 100 ohm (R15).
# The LMV324 has rail-to-rail outputs, so on a 5 V supply (SparkFun: 3.5-5.5 V, 5 V ideal) every output can reach
# 5 V. With a 3.3 V board each output therefore goes through a resistor divider (10k top, 15k bottom: x0.6) and
# this driver multiplies the ADC reading back by `scale` = (top + bottom) / bottom to give the module's own volts.
# Pass scale=1 if an output is wired straight to an ADC that tolerates the supply (e.g. a 5 V Arduino).
from machine import ADC, Pin
import time


def _adc(pin):
    a = ADC(Pin(pin) if isinstance(pin, int) else pin)
    try:
        a.atten(ADC.ATTN_11DB)  # ESP32: about 0-3.3 V input range; other ports have no atten()
    except AttributeError:
        pass
    return a


class SoundDetector:
    def __init__(self, audio=None, envelope=None, gate=None, scale=25 / 15, vref=3.3):
        """audio / envelope: GPIO numbers (or Pins) of ADC pins wired to AUDIO / ENVELOPE (None if unused).
        gate: GPIO number (or Pin) wired to GATE (None if unused).
        scale: divider ratio to undo, (top + bottom) / bottom; 25/15 for 10k over 15k, 1 for no divider.
        vref: ADC full scale in volts when read_uv() is not available (Pico: the 3.3 V supply)."""
        self.audio = _adc(audio) if audio is not None else None
        self.env = _adc(envelope) if envelope is not None else None
        self.gate_pin = (Pin(gate, Pin.IN) if isinstance(gate, int) else gate) if gate is not None else None
        self.scale = scale
        self.vref = vref

    def _volts(self, adc):
        if hasattr(adc, 'read_uv'):
            v = adc.read_uv() / 1e6
        else:
            v = adc.read_u16() * self.vref / 65535
        return v * self.scale

    def envelope(self, n=16):
        """ENVELOPE in volts at the module (mean of n readings): about 0 V when quiet, higher when louder."""
        total = 0.0
        for _ in range(n):
            total += self._volts(self.env)
        return total / n

    def gate(self):
        """1 while the module detects sound (GATE high, red LED lit), 0 when quiet."""
        return self.gate_pin.value()

    def audio_volts(self):
        """One AUDIO reading in volts at the module (sits at VCC/2 in silence)."""
        return self._volts(self.audio)

    def peak_to_peak(self, window_ms=50):
        """Spread (max - min) of AUDIO over window_ms, in volts at the module. 50 ms covers down to 20 Hz."""
        lo = hi = self._volts(self.audio)
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            v = self._volts(self.audio)
            if v < lo:
                lo = v
            elif v > hi:
                hi = v
        return hi - lo
