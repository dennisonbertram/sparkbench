# LM393 sound detection module (electret microphone + LM393 comparator, 3-pin OUT/GND/VCC),
# MicroPython driver.
# The microphone signal goes to one half of the LM393 (TI datasheet: open-collector output),
# compared with the voltage set on the blue trimmer. The board pulls OUT up to VCC, so:
#   HIGH (1) when it is quiet (status LED off)
#   LOW  (0) while the sound is louder than the trimmer threshold (status LED lit)
# A sound does not hold OUT low steadily: OUT follows the audio waveform and pulses LOW
# on its peaks (each pulse can be well under a millisecond). So sample OUT for a short
# window and treat any LOW in that window as "heard". OUT says nothing about how loud it is.
# Power the module from 3.3 V when using a 3.3 V board, because OUT is pulled up to VCC.
from machine import Pin
import time


class SoundDO:
    def __init__(self, pin, active_low=True):
        """pin: GPIO number (or Pin) wired to OUT.
        active_low: True (common board) if OUT goes LOW on sound."""
        # The module has its own pull-up on OUT; no internal pull needed.
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        self._on = 0 if active_low else 1

    def raw(self):
        """Logic level on OUT right now (0 or 1)."""
        return self.pin.value()

    def loud_now(self):
        """True if OUT shows sound at this instant (may miss short pulses)."""
        return self.pin.value() == self._on

    def heard(self, window_ms=50):
        """Watch OUT for window_ms and return True if sound passed the threshold at any time."""
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < window_ms:
            if self.pin.value() == self._on:
                return True
        return False
