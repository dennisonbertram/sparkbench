# TCRT5000 IR line tracking sensor module (blue 4-pin LM393 board: VCC, GND, DO, AO), MicroPython driver.
# Board circuit: the TCRT5000's IR LED is lit all the time (180 ohm from VCC). Its phototransistor
# collector is pulled up to VCC by 10 kOhm; that node is AO and goes to the LM393's + input.
# The trimmer VR1 sets the - input. DO is the LM393 open-collector output with a 10 kOhm pull-up to VCC.
#   Strong reflection (white / light surface close by): transistor conducts, AO falls, DO = LOW, LED on.
#   Weak reflection (black line, or nothing within ~1-15 mm): AO near VCC, DO = HIGH, LED off.
# Power the module from 3.3 V on a 3.3 V board: DO and AO swing up to VCC.
from machine import Pin, ADC


class TCRT5000:
    def __init__(self, do_pin, ao_pin=None):
        # DO already has a 10 kOhm pull-up on the board.
        self.do = Pin(do_pin, Pin.IN) if isinstance(do_pin, int) else do_pin
        self.ao = None
        if ao_pin is not None:
            if isinstance(ao_pin, int):
                try:
                    # ESP32: full 0-3.3 V range (default attenuation tops out near 1 V)
                    self.ao = ADC(Pin(ao_pin), atten=ADC.ATTN_11DB)
                except (AttributeError, TypeError):
                    self.ao = ADC(Pin(ao_pin))  # RP2040 and others: 0-3.3 V already
            else:
                self.ao = ao_pin

    def raw(self):
        """Logic level on DO: 0 = reflective surface seen, 1 = dark surface / nothing."""
        return self.do.value()

    def reflective(self):
        """True over a white / light surface (DO pulled low by the comparator)."""
        return self.do.value() == 0

    def on_line(self):
        """True over a black line (or with nothing in range): DO high."""
        return self.do.value() == 1

    def analog(self):
        """AO as 0-65535 (needs ao_pin). Lower = more IR reflected."""
        if self.ao is None:
            raise ValueError('TCRT5000: no AO pin given')
        return self.ao.read_u16()

    def irq(self, handler, on_reflect=True):
        """Call handler(pin) when a reflective surface appears (falling edge) or,
        with on_reflect=False, when the sensor moves onto a dark line (rising edge)."""
        trig = Pin.IRQ_FALLING if on_reflect else Pin.IRQ_RISING
        return self.do.irq(handler=handler, trigger=trig)
