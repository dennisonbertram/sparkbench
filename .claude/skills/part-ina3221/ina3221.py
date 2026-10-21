# INA3221 triple-channel current & voltage monitor (TI INA3221, SBOS576), MicroPython driver.
# All registers are 16-bit, sent MSB first. Per channel n = 1..3:
#   shunt voltage register 2n-1 (01h/03h/05h): signed two's complement in bits 15..3, LSB 40 uV
#   bus voltage register   2n   (02h/04h/06h): signed two's complement in bits 15..3, LSB 8 mV
#   (bits 2..0 always read 0). FEh Manufacturer ID = 5449h, FFh Die ID = 3220h.
# Current = shunt voltage / shunt resistor (0.05 ohm on the Adafruit #6062 board).
import time

_REG_CONFIG = 0x00
_REG_MANUFACTURER_ID = 0xFE
_REG_DIE_ID = 0xFF

# CH1en, CH2en, CH3en = 1; AVG = 16 samples (010); VBUSCT = 1.1 ms (100);
# VSHCT = 1.1 ms (100); MODE = shunt and bus, continuous (111).
_CONFIG = 0x7527


class INA3221:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.05):
        self.i2c = i2c
        self.addr = addr
        self.shunt_ohms = shunt_ohms
        if self._read(_REG_MANUFACTURER_ID) != 0x5449 or self._read(_REG_DIE_ID) != 0x3220:
            raise OSError('INA3221 not found at 0x%02x: check the wiring' % addr)
        self.i2c.writeto_mem(addr, _REG_CONFIG, bytes([_CONFIG >> 8, _CONFIG & 0xFF]))
        # 3 channels x (1.1 ms shunt + 1.1 ms bus) x 16 averages = about 106 ms per full cycle.
        time.sleep_ms(120)

    def _read(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _signed13(self, reg):
        raw = self._read(reg)
        if raw & 0x8000:
            raw -= 0x10000
        return raw >> 3  # 12 data bits + sign; the low 3 bits are unused

    def shunt_mv(self, ch):
        """Voltage across channel ch's shunt (ch = 1..3) in mV, 40 uV per count."""
        return self._signed13(2 * ch - 1) * 0.04

    def bus_voltage(self, ch):
        """Voltage on channel ch's VIN- pin (load side) relative to GND, in volts, 8 mV per count."""
        return self._signed13(2 * ch) * 0.008

    def current_ma(self, ch):
        """Current from VINn+ to VINn- in mA (negative if it flows the other way)."""
        return self.shunt_mv(ch) / self.shunt_ohms

    def power_mw(self, ch):
        return self.bus_voltage(ch) * self.current_ma(ch)

    def read(self, ch=1):
        """Return (bus voltage in V, current in mA) for channel ch."""
        return self.bus_voltage(ch), self.current_ma(ch)
