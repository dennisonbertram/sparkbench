# SparkFun Qwiic Dual Solid State Relay (COM-16810), MicroPython driver.
# The board's ATtiny84 runs SparkFun's Qwiic_Dual_Solid_State_Relay firmware: written bytes are
# commands, not a register pointer.
#   0x01 / 0x02         toggle relay 1 / relay 2 (there is no plain "on" or "off" per relay)
#   0x05 / 0x06         status: then read 1 byte, 0x0F = on, 0x00 = off
#   0x0A / 0x0B         all relays off / all relays on
#   0x10 / 0x11 <n>     slow PWM for relay 1 / 2: n = 0-120 steps of a 1 s period (0 = PWM off,
#                       120 = always on); write the code alone then read 1 byte to get n back
#   0xC7 <addr>         store a new I2C address (0x08-0x77) in EEPROM
# 0x0C (toggle all) is NOT used: in the shipped firmware it updates the status bytes but writes
# the wrong ATtiny pins, so the outputs can end up out of step with what status reports.
# on()/off() read the status first and toggle only if needed, exactly as SparkFun's library does.
import time

CMD_TOGGLE = (0x01, 0x02)
CMD_STATUS = (0x05, 0x06)
CMD_ALL_OFF = 0x0A
CMD_ALL_ON = 0x0B
CMD_PWM = (0x10, 0x11)
CMD_CHANGE_ADDRESS = 0xC7
STATUS_ON = 0x0F


class QwiicDualSSR:
    def __init__(self, i2c, addr=0x0A):
        self.i2c = i2c
        self.addr = addr

    @staticmethod
    def _idx(relay):
        if relay not in (1, 2):
            raise ValueError('relay must be 1 or 2')
        return relay - 1

    def _write(self, *b):
        self.i2c.writeto(self.addr, bytes(b))

    def _read(self, cmd):
        self._write(cmd)
        time.sleep_ms(1)  # let the ATtiny's I2C interrupt latch the command
        return self.i2c.readfrom(self.addr, 1)[0]

    def state(self, relay):
        """1 if the relay is switched on (load powered), 0 if off."""
        return 1 if self._read(CMD_STATUS[self._idx(relay)]) == STATUS_ON else 0

    def toggle(self, relay):
        self._write(CMD_TOGGLE[self._idx(relay)])

    def on(self, relay):
        if not self.state(relay):
            self.toggle(relay)

    def off(self, relay):
        if self.state(relay):
            self.toggle(relay)

    def value(self, relay, v=None):
        if v is None:
            return self.state(relay)
        if v:
            self.on(relay)
        else:
            self.off(relay)

    def all_on(self):
        self._write(CMD_ALL_ON)

    def all_off(self):
        self._write(CMD_ALL_OFF)

    def toggle_all(self):
        # Done per relay because the firmware's 0x0C command drives the wrong pins.
        self.toggle(1)
        self.toggle(2)

    def set_slow_pwm(self, relay, steps):
        """Slow 1 Hz PWM: steps 0-120 (each 1/120 s, one 60 Hz half-cycle). 0 stops PWM.
        While any relay runs PWM, the firmware forces relays with PWM 0 off each period."""
        if not 0 <= steps <= 120:
            raise ValueError('steps must be 0-120')
        self._write(CMD_PWM[self._idx(relay)], steps)

    def get_slow_pwm(self, relay):
        return self._read(CMD_PWM[self._idx(relay)])

    def change_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in EEPROM. Used only while the ADR jumper is closed."""
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(CMD_CHANGE_ADDRESS, new_addr)
        self.addr = new_addr
