# INA238 85 V, 16-bit current / voltage / power monitor (TI INA238, SLYS025B), MicroPython driver.
# Register pointer byte, then data MSB first. All registers used here are 16-bit (POWER, 08h, is 24-bit).
#   04h VSHUNT:  two's complement, 5 uV/LSB (ADCRANGE = 0) or 1.25 uV/LSB (ADCRANGE = 1).
#   05h VBUS:    3.125 mV/LSB (two's complement, always positive).
#   06h DIETEMP: bits 15-4, two's complement, 125 m-degC/LSB.
#   07h CURRENT: two's complement, Current [A] = CURRENT_LSB x CURRENT (datasheet eq. 3),
#                valid once SHUNT_CAL (02h) = 819.2e6 x CURRENT_LSB x R_SHUNT (eq. 1, ADCRANGE = 0).
#   3Eh MANUFACTURER_ID = 5449h ("TI"), 3Fh DEVICE_ID = 238xh (DIEID 238h + revision).
# Defaults suit the Adafruit INA238 breakout (#6349): 15 milliohm shunt, up to 10 A.
import time

_CONFIG = 0x00
_ADC_CONFIG = 0x01
_SHUNT_CAL = 0x02
_VSHUNT = 0x04
_VBUS = 0x05
_DIETEMP = 0x06
_CURRENT = 0x07
_MANUFACTURER_ID = 0x3E
_DEVICE_ID = 0x3F

# MODE = Fh (continuous bus, shunt and temperature), VBUSCT = VSHCT = VTCT = 5h (1052 us),
# AVG = 2h (16 samples): a fresh result about every 16 x 3 x 1.05 ms = 50 ms.
_ADC_SETTINGS = 0xFB6A


def _s16(v):
    return v - 0x10000 if v & 0x8000 else v


class INA238:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.015, max_amps=10.0):
        self.i2c = i2c
        self.addr = addr
        self.shunt_ohms = shunt_ohms
        if self._read16(_MANUFACTURER_ID) != 0x5449 or (self._read16(_DEVICE_ID) >> 4) != 0x238:
            raise OSError('INA238 not found at 0x%02x: check the wiring' % addr)
        # ADCRANGE = 0 (+-163.84 mV across the shunt). CURRENT_LSB must be at least
        # max_amps / 2^15 (eq. 2); use a round 500 uA for the 10 A default (305 uA minimum).
        lsb = max_amps / 32768
        self.current_lsb = 500e-6 if lsb <= 500e-6 else lsb
        cal = int(819.2e6 * self.current_lsb * shunt_ohms + 0.5)
        if not 0 < cal < 0x8000:
            raise ValueError('shunt_ohms / max_amps give SHUNT_CAL out of range')
        self._write16(_CONFIG, 0x8000)  # RST: back to power-on defaults (self-clearing)
        time.sleep_ms(2)
        self._write16(_CONFIG, 0x0000)  # ADCRANGE = 0, no conversion delay
        self._write16(_SHUNT_CAL, cal)  # 6144 for 0.015 ohm and 500 uA
        self._write16(_ADC_CONFIG, _ADC_SETTINGS)
        time.sleep_ms(60)  # wait for the first averaged result

    def _write16(self, reg, v):
        self.i2c.writeto_mem(self.addr, reg, bytes([(v >> 8) & 0xFF, v & 0xFF]))

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return (d[0] << 8) | d[1]

    def bus_voltage(self):
        """Voltage on VBUS relative to GND, in volts (3.125 mV per count)."""
        return _s16(self._read16(_VBUS)) * 3.125e-3

    def shunt_voltage_mv(self):
        """Voltage across the shunt (VIN+ minus VIN-) in mV (5 uV per count)."""
        return _s16(self._read16(_VSHUNT)) * 5e-3

    def current_ma(self):
        """Current from VIN+ to VIN- in mA (negative when it flows the other way)."""
        return _s16(self._read16(_CURRENT)) * self.current_lsb * 1000

    def die_temperature(self):
        """Chip temperature in degrees C (bits 15-4, 0.125 C per count)."""
        return (_s16(self._read16(_DIETEMP)) >> 4) * 0.125

    def power_mw(self):
        """Power delivered to the load in mW (bus voltage x current)."""
        return self.bus_voltage() * self.current_ma()

    def read(self):
        """Return (bus voltage in V, current in mA)."""
        return self.bus_voltage(), self.current_ma()
