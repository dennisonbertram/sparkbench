# INA226 current & power monitor (TI INA226, SBOS547), MicroPython driver.
# Registers are 16-bit, sent MSB first.
#   01h Shunt voltage: signed two's complement, LSB 2.5 uV (full scale +-81.92 mV).
#   02h Bus voltage:   unsigned, LSB 1.25 mV (bit 15 always 0; do not apply more than 36 V).
#   FEh Manufacturer ID = 5449h ("TI").
# Current is computed from the shunt voltage and the board's shunt resistor
# (0.1 ohm "R100" on the common CJMCU-226 module), so no calibration register is needed.
import time

_REG_CONFIG = 0x00
_REG_SHUNT = 0x01
_REG_BUS = 0x02
_REG_MANUFACTURER_ID = 0xFE

# AVG = 16 samples (010), VBUSCT = 1.1 ms (100), VSHCT = 1.1 ms (100),
# MODE = shunt and bus, continuous (111). Bit 14 reads back as 1 (as in the 4127h default).
_CONFIG = 0x4527


class INA226:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.1):
        self.i2c = i2c
        self.addr = addr
        self.shunt_ohms = shunt_ohms
        if self._read(_REG_MANUFACTURER_ID) != 0x5449:
            raise OSError('INA226 not found at 0x%02x: check the wiring' % addr)
        self.i2c.writeto_mem(addr, _REG_CONFIG, bytes([_CONFIG >> 8, _CONFIG & 0xFF]))
        # 16 averages x (1.1 ms shunt + 1.1 ms bus) = about 35 ms until the first full result.
        time.sleep_ms(40)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def shunt_mv(self):
        """Voltage across the shunt resistor in mV (signed, 2.5 uV per count)."""
        raw = self._read(_REG_SHUNT)
        if raw & 0x8000:
            raw -= 0x10000
        return raw * 0.0025

    def bus_voltage(self):
        """Voltage on the VBS pin relative to GND, in volts (1.25 mV per count)."""
        return (self._read(_REG_BUS) & 0x7FFF) * 0.00125

    def current_ma(self):
        """Current from IN+ to IN- in mA (negative if it flows the other way)."""
        return self.shunt_mv() / self.shunt_ohms

    def power_mw(self):
        """Power delivered to the load in mW (bus voltage x current)."""
        return self.bus_voltage() * self.current_ma()

    def read(self):
        """Return (bus voltage in V, current in mA)."""
        return self.bus_voltage(), self.current_ma()
