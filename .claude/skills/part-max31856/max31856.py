# MAX31856 precision thermocouple-to-digital converter (Analog Devices / Maxim), MicroPython driver.
# Written from datasheet 19-7534: SPI with CPHA = 1 (mode 1 or 3), registers read at 0Xh and written at 8Xh,
# address auto-increments during a multibyte transfer. Normally-off mode with 1-shot conversions.
# Thermocouple temperature: 19-bit signed in 0Ch..0Eh (bits 23..5), 0.0078125 C/LSB.
# Cold-junction temperature: 14-bit signed in 0Ah..0Bh (bits 15..2), 0.015625 C/LSB.
from machine import Pin
import time

_CR0 = 0x00
_CR1 = 0x01
_MASK = 0x02
_CJTH = 0x0A
_LTCBH = 0x0C
_SR = 0x0F

# CR0 bits
_ONE_SHOT = 0x40
_OCFAULT_01 = 0x10  # open-circuit detection, RS < 5 kohm
_FILTER_50HZ = 0x01

TYPES = {'B': 0, 'E': 1, 'J': 2, 'K': 3, 'N': 4, 'R': 5, 'S': 6, 'T': 7}
_AVG = {1: 0, 2: 1, 4: 2, 8: 3, 16: 4}

_FAULTS = ((0x80, 'cold junction out of range'), (0x40, 'thermocouple out of range'),
           (0x20, 'cold junction high'), (0x10, 'cold junction low'),
           (0x08, 'thermocouple high'), (0x04, 'thermocouple low'),
           (0x02, 'input over/undervoltage'), (0x01, 'thermocouple open'))


class MAX31856:
    def __init__(self, spi, cs, tc_type='K', filter_hz=60, samples=1):
        """spi: machine.SPI with phase=1 (mode 1 or 3), up to 5 MHz. cs: GPIO number of CS.
        tc_type: 'B', 'E', 'J', 'K', 'N', 'R', 'S' or 'T'. filter_hz: 50 or 60 (mains notch).
        samples: 1, 2, 4, 8 or 16 thermocouple samples averaged per conversion."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self._cr0 = _OCFAULT_01 | (_FILTER_50HZ if filter_hz == 50 else 0)  # normally-off, CJ sensor on
        self._write(_CR0, self._cr0)
        self._write(_CR1, (_AVG[samples] << 4) | TYPES[tc_type.upper()])
        self._write(_MASK, 0x00)  # let every fault assert the FLT pin
        # tCONV max 155 ms (60 Hz) / 185 ms (50 Hz), + open-circuit test (15 ms max),
        # + (samples - 1) x 33.33 ms (60 Hz) or 40 ms (50 Hz) when averaging
        per = 40 if filter_hz == 50 else 34
        self._conv_ms = (185 if filter_hz == 50 else 155) + 15 + (samples - 1) * per + 10

    def _write(self, reg, val):
        self.cs.value(0)
        self.spi.write(bytes([0x80 | reg, val & 0xFF]))
        self.cs.value(1)

    def _read(self, reg, n):
        buf = bytearray(n + 1)
        self.cs.value(0)
        self.spi.write_readinto(bytes([reg & 0x7F]) + bytes(n), buf)
        self.cs.value(1)
        return buf[1:]

    def fault(self):
        """Fault Status register (0Fh); 0 = no fault."""
        return self._read(_SR, 1)[0]

    def convert(self):
        """Start a 1-shot conversion (it begins when CS goes high) and wait for it to finish."""
        self._write(_CR0, self._cr0 | _ONE_SHOT)
        time.sleep_ms(self._conv_ms)

    def thermocouple(self):
        """Linearized, cold-junction-compensated thermocouple temperature in C from the last conversion.
        Raises OSError on an open thermocouple or an input over/undervoltage."""
        d = self._read(_LTCBH, 4)  # 0Ch, 0Dh, 0Eh, then 0Fh (fault status) in one transfer
        sr = d[3]
        if sr & 0x03:
            raise OSError('MAX31856 fault: ' + ', '.join(n for b, n in _FAULTS if sr & b))
        raw = ((d[0] << 16) | (d[1] << 8) | d[2]) >> 5
        if raw & 0x40000:
            raw -= 0x80000
        return raw * 0.0078125

    def cold_junction(self):
        """Cold-junction (chip) temperature in C."""
        d = self._read(_CJTH, 2)
        raw = ((d[0] << 8) | d[1]) >> 2
        if raw & 0x2000:
            raw -= 0x4000
        return raw * 0.015625

    def read(self):
        """Run one conversion and return (thermocouple C, cold junction C)."""
        self.convert()
        return self.thermocouple(), self.cold_junction()
