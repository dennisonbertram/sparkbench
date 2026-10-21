# INA260 precision current, voltage & power monitor (Texas Instruments), MicroPython driver.
# Written from the TI datasheet (SBOS656C): 16-bit registers sent MSB first, fixed LSBs:
# current 1.25 mA (two's complement), bus voltage 1.25 mV, power 10 mW.
import time

_REG_CONFIG = 0x00
_REG_CURRENT = 0x01
_REG_BUS_VOLTAGE = 0x02
_REG_POWER = 0x03
_REG_MASK_ENABLE = 0x06
_REG_ALERT_LIMIT = 0x07
_REG_MANUFACTURER_ID = 0xFE
_REG_DIE_ID = 0xFF

_MANUFACTURER_ID = 0x5449  # "TI"


class INA260:
    def __init__(self, i2c, addr=0x40):
        self.i2c = i2c
        self.addr = addr
        if self._read(_REG_MANUFACTURER_ID) != _MANUFACTURER_ID:
            raise OSError('INA260 not found at 0x%02X: check wiring and the A0/A1 address jumpers' % addr)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _write(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def reset(self):
        """Reset all registers to their power-on values (config bit 15)."""
        self._write(_REG_CONFIG, 0x8000)
        time.sleep_ms(2)

    def configure(self, avg=0, vbus_ct=4, ishunt_ct=4, mode=7):
        """avg 0-7 (1,4,16,64,128,256,512,1024 samples), conversion-time codes 0-7
        (140 us ... 8.244 ms, 4 = 1.1 ms), mode 7 = continuous current and voltage (power-on default)."""
        self._write(_REG_CONFIG, 0x6000 | ((avg & 7) << 9) | ((vbus_ct & 7) << 6) | ((ishunt_ct & 7) << 3) | (mode & 7))

    def current(self):
        """Current through the integrated 2 mOhm shunt in mA (positive = Vin+ to Vin-)."""
        raw = self._read(_REG_CURRENT)
        if raw & 0x8000:
            raw -= 0x10000
        return raw * 1.25

    def voltage(self):
        """Bus voltage on VBus in volts (0-36 V)."""
        return (self._read(_REG_BUS_VOLTAGE) & 0x7FFF) * 0.00125

    def power(self):
        """Power in mW as computed by the chip (|current| x bus voltage)."""
        return self._read(_REG_POWER) * 10

    def conversion_ready(self):
        """True once a new conversion is complete (reading clears the flag)."""
        return bool(self._read(_REG_MASK_ENABLE) & 0x0008)
