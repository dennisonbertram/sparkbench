# Pimoroni Trackball Breakout (PIM447), MicroPython driver.
# A Nuvoton MS51XB9AE (older boards: N76E003AQ20) runs Pimoroni's firmware: it counts the four
# Hall-effect roller sensors and the dome switch under the ball, dims the RGBW LEDs and answers on I2C
# with a byte register map (from Pimoroni's trackball-python and pimoroni-pico drivers):
#   0x00-0x03 LED red, green, blue, white (0-255, PWM brightness)
#   0x04 LEFT, 0x05 RIGHT, 0x06 UP, 0x07 DOWN: roller counts since the last read (cleared when read)
#   0x08 SWITCH: bit 7 = ball pressed now, bits 6-0 = number of press/release changes since the last read
#   0xF9 INT: bit 0 = interrupt triggered, bit 1 = drive the INT pin (active low)
#   0xFA/0xFB chip ID low/high = 0xBA11   0xFC firmware version   0xFD I2C address (kept in flash)
#   0xFE CTRL: bit 0 sleep, bit 1 reset, bit 2 flash read, bit 3 flash write
# Reads: register number, then read; the pointer auto-increments, so one 5-byte read from 0x04 takes
# left, right, up, down and switch together. Pimoroni runs the bus at 100 kHz or less.
import time

ADDR = 0x0A          # 0x0B with the ADDR+1 trace cut
CHIP_ID = 0xBA11

_LED_RED = 0x00
_LEFT = 0x04
_SWITCH = 0x08
_INT = 0xF9
_CHIP_ID_L = 0xFA
_VERSION = 0xFC
_I2C_ADDR = 0xFD
_CTRL = 0xFE

_SW_STATE = 0x80
_INT_TRIGGERED = 0x01
_INT_OUT_EN = 0x02
_CTRL_SLEEP = 0x01


class Trackball:
    def __init__(self, i2c, addr=ADDR, int_pin=None, timeout_ms=5000):
        self.i2c = i2c
        self.addr = addr
        self.int_pin = int_pin   # optional machine.Pin (input) wired to INT
        self.timeout_ms = timeout_ms
        d = self._read(_CHIP_ID_L, 2)
        chip = d[0] | (d[1] << 8)
        if chip != CHIP_ID:
            raise OSError('Trackball not found at 0x%02X (chip ID 0x%04X)' % (addr, chip))
        self.enable_interrupt(True)

    # --- low level
    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _write(self, reg, data):
        self.i2c.writeto_mem(self.addr, reg, bytes(data))

    # --- identity
    def version(self):
        return self._read(_VERSION, 1)[0]

    # --- motion and switch
    def read(self):
        """Return (left, right, up, down, sw_changes, pressed).

        The four direction counts are how far the ball rolled each way since the previous read
        (the firmware clears them when they are read), so poll regularly and add them up yourself."""
        left, right, up, down, sw = self._read(_LEFT, 5)
        return left, right, up, down, sw & ~_SW_STATE & 0xFF, bool(sw & _SW_STATE)

    def pressed(self):
        """True while the ball is pushed in (also clears the switch change count)."""
        return bool(self._read(_SWITCH, 1)[0] & _SW_STATE)

    # --- LEDs
    def set_rgbw(self, r, g, b, w):
        self._write(_LED_RED, (r & 0xFF, g & 0xFF, b & 0xFF, w & 0xFF))

    # --- interrupt
    def enable_interrupt(self, on=True):
        v = self._read(_INT, 1)[0] & ~_INT_OUT_EN & 0xFF
        if on:
            v |= _INT_OUT_EN
        self._write(_INT, (v,))

    def interrupt(self):
        """True when the trackball has new data (INT pin low, or the INT register's triggered bit)."""
        if self.int_pin is not None:
            return self.int_pin.value() == 0
        return bool(self._read(_INT, 1)[0] & _INT_TRIGGERED)

    # --- power / address
    def sleep(self, on=True):
        self._write(_CTRL, (_CTRL_SLEEP if on else 0,))

    def change_address(self, new_addr):
        """Store a new 7-bit I2C address in the MCU's flash."""
        self._write(_I2C_ADDR, (new_addr & 0x7F,))
        self._wait_for_flash()

    def _wait_for_flash(self):
        # The firmware drops the interrupt while it writes flash and raises it when done.
        t0 = time.ticks_ms()
        while self.interrupt():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('Trackball flash write timed out')
            time.sleep_ms(1)
        t0 = time.ticks_ms()
        while not self.interrupt():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('Trackball flash write timed out')
            time.sleep_ms(1)
