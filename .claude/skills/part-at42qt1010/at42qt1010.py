# AT42QT1010 one-key capacitive touch sensor (Microchip/Atmel QTouch), MicroPython driver.
# SparkFun AT42QT1010 Capacitive Touch Breakout (SEN-12041): header GND, OUT, VDD, LED.
# OUT is the chip's push-pull output, active HIGH while a touch is detected (datasheet 3.9.1).
# No pull resistor is needed. Datasheet timing: ~100 ms after power-up OUT is not valid
# (power-on calibration); the Max On-duration (~60 s at 3 V, LP mode) forces a recalibration,
# so a touch held longer than that drops OUT low again.
# HeartBeat: once per burst OUT is tri-stated for 15 us; a plain CMOS GPIO input ignores it,
# so do not enable a pull resistor if you want clean levels.
from machine import Pin
import time


class AT42QT1010:
    POWER_UP_MS = 100  # datasheet 4.x: OUT invalid for ~100 ms after power-up

    def __init__(self, pin, wait_power_up=True):
        self.pin = Pin(pin, Pin.IN) if isinstance(pin, int) else pin
        if wait_power_up:
            time.sleep_ms(self.POWER_UP_MS)

    def value(self):
        """Raw level on OUT (0 or 1)."""
        return self.pin.value()

    def touched(self):
        """True while the electrode is touched (OUT is active high)."""
        return self.pin.value() == 1

    def irq(self, handler, on_touch=True):
        """Call handler(pin) on the edge where a touch starts (on_touch) or ends."""
        self.pin.irq(handler=handler, trigger=Pin.IRQ_RISING if on_touch else Pin.IRQ_FALLING)
