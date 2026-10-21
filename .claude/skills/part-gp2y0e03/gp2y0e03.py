# Sharp GP2Y0E03 I2C/analog IR distance sensor (4-50 cm), MicroPython driver.
# Written from the Sharp GP2Y0E02/03 application note (Table.11 register map, bank 0):
#   0x35 Shift Bit [2:0]  (0x02 = 64 cm full scale, default; 0x01 = 128 cm)
#   0x5E Distance[11:4], 0x5F Distance[3:0]
#   distance (cm) = (Distance[11:4] * 16 + Distance[3:0]) / 16 / 2**n,  n = Shift Bit
# 7-bit I2C address 0x40 (Sharp writes it as 0x80 write / 0x81 read). Max 400 kHz.
# GPIO1 must be HIGH (active state); I2C access is allowed 500 us after GPIO1 goes high.
import time
from machine import Pin

GP2Y0E03_ADDR = 0x40

_REG_SHIFT = 0x35
_REG_DIST_HI = 0x5E
_REG_BANK = 0xEF


class GP2Y0E03:
    def __init__(self, i2c, addr=GP2Y0E03_ADDR, gpio1=None):
        """gpio1: GPIO number wired to the sensor's GPIO1 pin (driven high = active),
        or None if GPIO1 is tied to VIN(IO) in hardware."""
        self.i2c = i2c
        self.addr = addr
        self._en = None
        if gpio1 is not None:
            self._en = Pin(gpio1, Pin.OUT, value=1)
        time.sleep_ms(1)  # T6/T8: >= 500 us before the first I2C access
        self.i2c.writeto_mem(self.addr, _REG_BANK, b'\x00')  # select register bank 0
        self.shift = self.i2c.readfrom_mem(self.addr, _REG_SHIFT, 1)[0] & 0x07

    def active(self, on=True):
        """Switch between active (GPIO1 high) and stand-by (GPIO1 low, about 20 uA)."""
        if self._en is None:
            raise ValueError('GPIO1 is not connected to a pin')
        self._en.value(1 if on else 0)
        if on:
            time.sleep_ms(1)

    def set_max_range(self, cm=64):
        """Full-scale output: 64 cm (Shift Bit 2, default) or 128 cm (Shift Bit 1).
        Accuracy is only specified up to 50 cm either way."""
        n = 2 if cm <= 64 else 1
        self.i2c.writeto_mem(self.addr, _REG_SHIFT, bytes([n]))
        self.shift = n

    def raw(self):
        """12-bit distance value from registers 0x5E (bits 11:4) and 0x5F (bits 3:0)."""
        d = self.i2c.readfrom_mem(self.addr, _REG_DIST_HI, 2)
        return (d[0] << 4) | (d[1] & 0x0F)

    def distance_cm(self):
        """Distance in cm = raw / 16 / 2**shift (datasheet Table.11)."""
        return self.raw() / 16 / (1 << self.shift)
