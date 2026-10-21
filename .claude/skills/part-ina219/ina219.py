# INA219 current & voltage sensor (TI INA219, SBOS448G), MicroPython driver.
# Registers are 16-bit, sent MSB first. Shunt voltage (01h): signed, LSB 10 uV.
# Bus voltage (02h): bits 15..3, LSB 4 mV (bit 1 CNVR, bit 0 OVF).
# Current is computed from the shunt voltage and the board's shunt resistor
# (0.1 ohm "R100" on the common breakouts), so no calibration register is needed.
import time

_REG_CONFIG = 0x00
_REG_SHUNT = 0x01
_REG_BUS = 0x02

# 32 V bus range, PGA /8 (+-320 mV), 12-bit shunt and bus ADC, continuous shunt + bus.
# This is the power-on default (399Fh); written explicitly in case another program changed it.
_CONFIG_DEFAULT = 0x399F


class INA219:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.1):
        self.i2c = i2c
        self.addr = addr
        self.shunt_ohms = shunt_ohms
        self.i2c.writeto_mem(addr, _REG_CONFIG, bytes([_CONFIG_DEFAULT >> 8, _CONFIG_DEFAULT & 0xFF]))
        time.sleep_ms(2)  # one 12-bit shunt + bus conversion takes 2 x 532 us

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def shunt_mv(self):
        """Voltage across the shunt resistor in mV (signed, 10 uV per count)."""
        raw = self._read(_REG_SHUNT)
        if raw & 0x8000:
            raw -= 0x10000
        return raw * 0.01

    def bus_voltage(self):
        """Voltage on VIN- relative to GND, in volts (4 mV per count)."""
        return (self._read(_REG_BUS) >> 3) * 0.004

    def current_ma(self):
        """Current from VIN+ to VIN- in mA (negative if it flows the other way)."""
        return self.shunt_mv() / self.shunt_ohms

    def power_mw(self):
        """Power delivered to the load in mW."""
        return self.bus_voltage() * self.current_ma()

    def read(self):
        """Return (bus voltage in V, current in mA)."""
        return self.bus_voltage(), self.current_ma()
