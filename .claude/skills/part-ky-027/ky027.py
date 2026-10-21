# KY-027 magic light cup module, MicroPython driver.
# The board carries two independent circuits on a 4-pin header G, +, S, L:
#  * a mercury tilt switch between S and G (GND) with a 10 kOhm pull-up (marked 103)
#    from S to +. S is HIGH while the switch is open and LOW while the mercury
#    bridges the contacts. Which tilt closes it depends on how the board is held.
#  * an LED whose anode is L and whose cathode is G. There is NO series resistor on
#    the board: put 120 Ohm (3.3 V) or 220 Ohm (5 V) between the GPIO and L.
# Power + from 3.3 V on a 3.3 V board: the pull-up takes S up to the + supply.
from machine import Pin, PWM
import time


class KY027:
    def __init__(self, s_pin, l_pin, debounce_ms=50):
        # The board has its own 10k pull-up; an internal pull-up is harmless and
        # keeps S defined if + is left unconnected.
        self.s = Pin(s_pin, Pin.IN, Pin.PULL_UP)
        self.l_num = l_pin
        self.l = Pin(l_pin, Pin.OUT, value=0)
        self._pwm = None
        self.debounce_ms = debounce_ms

    def raw(self):
        """Logic level on S right now: 0 = switch closed, 1 = open."""
        return self.s.value()

    def closed(self):
        """Debounced: True if S stays LOW (switch closed) for debounce_ms."""
        state = self.s.value()
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < self.debounce_ms:
            v = self.s.value()
            if v != state:
                state = v
                t0 = time.ticks_ms()
            time.sleep_ms(2)
        return state == 0

    def led(self, on):
        """Switch the LED fully on or off."""
        if self._pwm is not None:
            self._pwm.deinit()
            self._pwm = None
            self.l = Pin(self.l_num, Pin.OUT)
        self.l.value(1 if on else 0)

    def brightness(self, level, freq=1000):
        """Dim the LED with PWM: level 0..255 (the 'pouring light' effect)."""
        level = max(0, min(255, int(level)))
        if self._pwm is None:
            self._pwm = PWM(Pin(self.l_num), freq=freq)
        self._pwm.duty_u16(level * 65535 // 255)
