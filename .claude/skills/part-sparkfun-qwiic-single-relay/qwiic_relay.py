# SparkFun Qwiic Single Relay (COM-15093), MicroPython driver.
# The board's ATtiny85 runs SparkFun's Qwiic_Relay firmware: a one-byte command protocol,
# not a register map. 0x01 = relay on, 0x00 = relay off, 0x04 = firmware version
# (then read 2 bytes: major, minor), 0x05 = status (then read 1 byte: 1 on, 0 off),
# 0x03 <addr> = change the I2C address (stored in EEPROM, 0x08-0x77).
# There is no toggle command: toggle() reads the status and sends on/off, as SparkFun's library does.
import time

CMD_OFF = 0x00
CMD_ON = 0x01
CMD_CHANGE_ADDRESS = 0x03
CMD_VERSION = 0x04
CMD_STATUS = 0x05


class QwiicRelay:
    def __init__(self, i2c, addr=0x18):
        self.i2c = i2c
        self.addr = addr

    def _cmd(self, c):
        self.i2c.writeto(self.addr, bytes([c]))

    def on(self):
        self._cmd(CMD_ON)

    def off(self):
        self._cmd(CMD_OFF)

    def value(self, v=None):
        """relay.value(1) / relay.value(0) switches it; relay.value() returns the state."""
        if v is None:
            return self.state()
        self._cmd(CMD_ON if v else CMD_OFF)

    def state(self):
        """1 if the relay is energised (NO closed to COM), 0 if not."""
        self._cmd(CMD_STATUS)
        time.sleep_ms(1)  # give the ATtiny's I2C interrupt time to latch the command
        return self.i2c.readfrom(self.addr, 1)[0]

    def toggle(self):
        if self.state() == 1:
            self.off()
        else:
            self.on()

    def version(self):
        """Firmware version as a string, e.g. '1.1'."""
        self._cmd(CMD_VERSION)
        time.sleep_ms(1)
        d = self.i2c.readfrom(self.addr, 2)
        return '%d.%d' % (d[0], d[1])

    def change_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in the board's EEPROM; it answers there at once."""
        if not 0x07 < new_addr < 0x78:
            raise ValueError('address must be 0x08-0x77')
        self.i2c.writeto(self.addr, bytes([CMD_CHANGE_ADDRESS, new_addr]))
        self.addr = new_addr
