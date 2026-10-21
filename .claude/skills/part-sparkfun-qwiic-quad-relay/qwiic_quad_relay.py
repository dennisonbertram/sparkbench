# SparkFun Qwiic Quad Relay (COM-16566 v2.0 / COM-15102 v1.0), MicroPython driver.
# The board's ATtiny84A runs SparkFun's Qwiic_Quad_Relay firmware: one-byte commands, not a register map.
#   0x01-0x04  toggle relay 1-4
#   0x05-0x08  select the status of relay 1-4; the next read returns 0x0F (on) or 0x00 (off).
#              A longer read continues with the following relays up to relay 4 (0x05 + 4 bytes = all four).
#   0x0A all off, 0x0B all on, 0x0C toggle all
#   0xC7 <addr> change the I2C address (0x08-0x77, stored in EEPROM)
# There is no "relay N on" command: on()/off() read the status and toggle only when needed,
# as SparkFun's Arduino library does.

CMD_TOGGLE_BASE = 0x00   # + relay (1-4)
CMD_STATUS_BASE = 0x04   # + relay (1-4)
CMD_ALL_OFF = 0x0A
CMD_ALL_ON = 0x0B
CMD_TOGGLE_ALL = 0x0C
CMD_CHANGE_ADDRESS = 0xC7
RELAY_IS_ON = 0x0F


class QwiicQuadRelay:
    def __init__(self, i2c, addr=0x6D):
        self.i2c = i2c
        self.addr = addr

    def _cmd(self, c):
        self.i2c.writeto(self.addr, bytes([c]))

    @staticmethod
    def _check(relay):
        if relay not in (1, 2, 3, 4):
            raise ValueError('relay must be 1-4')

    def state(self, relay):
        """1 if relay 1-4 is energised (COM connected to NO), else 0."""
        self._check(relay)
        self._cmd(CMD_STATUS_BASE + relay)
        return 1 if self.i2c.readfrom(self.addr, 1)[0] == RELAY_IS_ON else 0

    def states(self):
        """States of all four relays as a list [r1, r2, r3, r4] (one status read of 4 bytes)."""
        self._cmd(CMD_STATUS_BASE + 1)
        return [1 if b == RELAY_IS_ON else 0 for b in self.i2c.readfrom(self.addr, 4)]

    def toggle(self, relay):
        self._check(relay)
        self._cmd(CMD_TOGGLE_BASE + relay)

    def on(self, relay):
        if not self.state(relay):
            self.toggle(relay)

    def off(self, relay):
        if self.state(relay):
            self.toggle(relay)

    def value(self, relay, v=None):
        """value(n) returns relay n's state; value(n, 1/0) switches it."""
        if v is None:
            return self.state(relay)
        if v:
            self.on(relay)
        else:
            self.off(relay)

    def all_on(self):
        self._cmd(CMD_ALL_ON)

    def all_off(self):
        self._cmd(CMD_ALL_OFF)

    def toggle_all(self):
        self._cmd(CMD_TOGGLE_ALL)

    def change_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in EEPROM; the board answers there at once
        (unless the ADDR jumper is closed, which forces 0x6C)."""
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self.i2c.writeto(self.addr, bytes([CMD_CHANGE_ADDRESS, new_addr]))
        self.addr = new_addr
