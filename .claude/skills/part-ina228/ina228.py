# INA228 85 V, 20-bit current / voltage / power monitor (TI INA228, SLYS021A), MicroPython driver.
# Register pointer byte, then data MSB first. CONFIG, ADC_CONFIG, SHUNT_CAL and the ID registers
# are 16-bit; VSHUNT, VBUS and CURRENT are 24-bit (read 3 bytes) with the 20-bit result in bits 23-4.
#   05h VBUS:    bits 23-4, LSB 195.3125 uV (always positive).
#   07h CURRENT: bits 23-4, two's complement, Current [A] = CURRENT_LSB x CURRENT (datasheet eq. 4),
#                valid once SHUNT_CAL (02h) = 13107.2e6 x CURRENT_LSB x R_SHUNT (eq. 2, ADCRANGE = 0).
#   3Eh MANUFACTURER_ID = 5449h ("TI"), 3Fh DEVICE_ID = 228xh (DIEID 228h + revision).
# Defaults suit the Adafruit INA228 breakout (#5832): 15 milliohm shunt, up to 10 A.
import time

_CONFIG = 0x00
_ADC_CONFIG = 0x01
_SHUNT_CAL = 0x02
_VBUS = 0x05
_CURRENT = 0x07
_MANUFACTURER_ID = 0x3E
_DEVICE_ID = 0x3F

# MODE = Fh (continuous bus, shunt and temperature), VBUSCT = VSHCT = VTCT = 5h (1052 us),
# AVG = 2h (16 samples): a fresh result about every 16 x 3 x 1.05 ms = 50 ms.
_ADC_SETTINGS = 0xFB6A


class INA228:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.015, max_amps=10.0):
        self.i2c = i2c
        self.addr = addr
        if self._read16(_MANUFACTURER_ID) != 0x5449 or (self._read16(_DEVICE_ID) >> 4) != 0x228:
            raise OSError('INA228 not found at 0x%02x: check the wiring' % addr)
        # ADCRANGE = 0 (+-163.84 mV across the shunt). CURRENT_LSB must be at least
        # max_amps / 2^19 (eq. 3); use a round 20 uA for the 10 A default.
        lsb = max_amps / 524288
        self.current_lsb = 20e-6 if lsb <= 20e-6 else lsb
        cal = int(13107.2e6 * self.current_lsb * shunt_ohms + 0.5)
        if not 0 < cal < 0x8000:
            raise ValueError('shunt_ohms / max_amps give SHUNT_CAL out of range')
        self._write16(_CONFIG, 0x8000)  # RST: back to power-on defaults (self-clearing)
        time.sleep_ms(2)
        self._write16(_CONFIG, 0x0000)  # ADCRANGE = 0, no conversion delay
        self._write16(_SHUNT_CAL, cal)
        self._write16(_ADC_CONFIG, _ADC_SETTINGS)
        time.sleep_ms(60)  # wait for the first averaged result

    def _write16(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([(v >> 8) & 0xFF, v & 0xFF]))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def _read20(self, reg):
        """A 24-bit result register: the 20-bit value in bits 23-4."""
        d = self.i2c.readfrom_mem(self.addr, reg, 3)
        return ((d[0] << 16) | (d[1] << 8) | d[2]) >> 4

    def bus_voltage(self):
        """Voltage on VBUS relative to GND, in volts (195.3125 uV per count)."""
        raw = self._read20(_VBUS)
        if raw & 0x80000:  # two's complement field, always positive in practice
            raw -= 0x100000
        return raw * 195.3125e-6

    def current_ma(self):
        """Current from VIN+ to VIN- in mA (negative when it flows the other way)."""
        raw = self._read20(_CURRENT)
        if raw & 0x80000:
            raw -= 0x100000
        return raw * self.current_lsb * 1000

    def power_mw(self):
        """Power delivered to the load in mW (bus voltage x current)."""
        return self.bus_voltage() * self.current_ma()

    def read(self):
        """Return (bus voltage in V, current in mA)."""
        return self.bus_voltage(), self.current_ma()
