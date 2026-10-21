# KY-033 line tracking sensor module (Joy-IT / Keyes board, header G, +V, S), MicroPython driver.
# Board: a Vishay TCRT5000 reflective sensor (IR LED + phototransistor) feeding an LM393 comparator
# whose threshold is set by the trimmer. The comparator output is the S pin.
#   Over a black / light-absorbing line (or nothing within range): S = HIGH, module LED off.
#   Over a white / reflective surface:                           S = LOW,  module LED on.
# The LM393 output is open collector, so the input pull-up is enabled here (Joy-IT's own
# examples do the same); it is harmless if the board also has a pull-up resistor.
# Power the module from 3.3 V on a 3.3 V board (ESP32, Pico).
from machine import Pin


class KY033:
    def __init__(self, s_pin, pull_up=True):
        if isinstance(s_pin, int):
            self.pin = Pin(s_pin, Pin.IN, Pin.PULL_UP if pull_up else None)
        else:
            self.pin = s_pin

    def value(self):
        """Logic level on S: 1 = over a dark line / nothing, 0 = over a reflective surface."""
        return self.pin.value()

    def on_line(self):
        """True while the sensor is over a black (light-absorbing) line."""
        return self.pin.value() == 1

    def reflective(self):
        """True while the sensor is over a white / reflective surface."""
        return self.pin.value() == 0

    def irq(self, handler, on_line=True):
        """Call handler(pin) when the sensor moves onto a dark line (rising edge) or,
        with on_line=False, when it moves onto a reflective surface (falling edge)."""
        trig = Pin.IRQ_RISING if on_line else Pin.IRQ_FALLING
        return self.pin.irq(handler=handler, trigger=trig)
