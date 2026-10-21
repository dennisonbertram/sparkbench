# SparkFun Qwiic Joystick (COM-15168), MicroPython driver.
# An ATtiny85 (SparkFun firmware v2.6) reads the thumb joystick's two 10 kOhm pots with its
# 10-bit ADC and serves a byte register map at I2C address 0x20:
#   0x00 ID (current I2C address)  0x01/0x02 firmware major/minor
#   0x03/0x04 X MSB/LSB  0x05/0x06 Y MSB/LSB   (10-bit reading << 6, left-justified)
#   0x07 button state (1 = released, 0 = pressed; the pin has a pull-up)
#   0x08 button status (1 = pressed since cleared; write 0 to clear)
#   0x09 I2C lock (write 0x13 first)  0x0A new I2C address (0x08-0x77, stored in EEPROM)
# The firmware streams the map from the requested register, so one 5-byte read from 0x03
# gives X, Y and the button from a single ADC update (as SparkFun's Python example does).
import time

ADDR = 0x20


class QwiicJoystick:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, val):
        self.i2c.writeto(self.addr, bytes([reg, val]))
        time.sleep_ms(30)  # the firmware may write EEPROM; SparkFun's library waits 30 ms

    def version(self):
        d = self._read(0x01, 2)
        return d[0], d[1]

    def read(self):
        """Return (x, y, pressed): x and y are 0-1023 (about 512 at rest), pressed is True/False."""
        d = self._read(0x03, 5)
        x = ((d[0] << 8) | d[1]) >> 6
        y = ((d[2] << 8) | d[3]) >> 6
        return x, y, d[4] == 0

    def horizontal(self):
        return self.read()[0]

    def vertical(self):
        return self.read()[1]

    def pressed(self):
        return self.read()[2]

    def clicked(self):
        """True if the button was pressed since the last call (reads then clears register 0x08)."""
        s = self._read(0x08, 1)[0]
        self._write(0x08, 0x00)
        return s == 1

    def set_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in the joystick's EEPROM."""
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(0x09, 0x13)
        self._write(0x0A, new_addr)
        self.addr = new_addr
