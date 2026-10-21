# Adafruit STEMMA Reflective Photo Interrupt Sensor (product 5913, Vishay TCRT1000), MicroPython driver.
# Board circuit (Adafruit "Stemma TCRT1000 rev A" schematic):
#   IR LED: anode through the 200 ohm trimmer R5 and R2 to VIN, always on. The trimmer sets the LED
#   current from about 10 mA (least sensitive) to about 100 mA (most sensitive).
#   Phototransistor: emitter to GND, collector = SIG, pulled up to VIN by R4 (10 kOhm).
#   Red "Sig" LED (via R1) from VIN to SIG lights when SIG is pulled low.
# So: nothing in front -> transistor off -> SIG HIGH (= VIN).
#     IR bounced back by an object / light surface (best at about 1 mm, 0.2-4 mm) -> SIG pulled toward 0 V -> LOW.
# SIG swings up to VIN: on a 3.3 V board (ESP32, Pico) power VIN from 3.3 V.
from machine import Pin


class StemmaReflective:
    def __init__(self, sig_pin):
        # SIG already has a 10 kOhm pull-up to VIN on the board.
        self.sig = Pin(sig_pin, Pin.IN) if isinstance(sig_pin, int) else sig_pin

    def raw(self):
        """Logic level on SIG: 0 = reflection detected, 1 = nothing detected."""
        return self.sig.value()

    def detected(self):
        """True while IR is reflected back into the phototransistor (object / light surface close in front)."""
        return self.sig.value() == 0

    def irq(self, handler, on_detect=True):
        """Call handler(pin) when an object appears (falling edge) or, with on_detect=False,
        when it goes away (rising edge)."""
        trig = Pin.IRQ_FALLING if on_detect else Pin.IRQ_RISING
        return self.sig.irq(handler=handler, trigger=trig)
