# MAX31865 RTD-to-digital converter (Analog Devices / Maxim), MicroPython driver.
# Written from datasheet 19-6478 Rev 3: SPI mode 1 or 3 (CPHA = 1), read address 0Xh, write 8Xh,
# 1-shot conversion with VBIAS switched on beforehand, RRTD = ADC code x RREF / 2^15,
# temperature from the IEC 751 Callendar-Van Dusen equation.
from machine import Pin
import math
import time

_CONFIG = 0x00
_RTD_MSB = 0x01
_FAULT = 0x07

_BIAS = 0x80
_ONE_SHOT = 0x20
_THREE_WIRE = 0x10
_FAULT_CLEAR = 0x02
_FILTER_50HZ = 0x01

# IEC 751 Callendar-Van Dusen coefficients (datasheet)
_A = 3.90830e-3
_B = -5.77500e-7
_C = -4.18301e-12


class MAX31865:
    def __init__(self, spi, cs, rref=430.0, r0=100.0, wires=4, filter_hz=60):
        """spi: machine.SPI in mode 1 (polarity=0, phase=1), up to 5 MHz.
        cs: GPIO number of CS. rref: reference resistor (430 ohm on the Adafruit PT100 board,
        4300 ohm on the PT1000 version). r0: RTD resistance at 0 C (100 for PT100).
        wires: 2, 3 or 4 (3 needs the board's 3-wire jumpers too). filter_hz: 50 or 60 (mains notch)."""
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.rref = rref
        self.r0 = r0
        self._cfg = (_THREE_WIRE if wires == 3 else 0) | (_FILTER_50HZ if filter_hz == 50 else 0)
        self._conv_ms = 63 if filter_hz == 50 else 52  # 62.5 ms / 52 ms single conversion
        self._write(_CONFIG, self._cfg)  # normally-off, VBIAS off

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
        """Fault Status register (07h): D7 RTD high, D6 RTD low, D5..D3 REFIN/RTDIN, D2 over/undervoltage."""
        return self._read(_FAULT, 1)[0]

    def clear_fault(self):
        # Fault Status Clear with D5, D3 and D2 written as 0 (datasheet).
        self._write(_CONFIG, self._cfg | _FAULT_CLEAR)

    def read_raw(self):
        """Run one 1-shot conversion and return the 15-bit ADC code (RRTD / RREF x 32768)."""
        self.clear_fault()
        self._write(_CONFIG, self._cfg | _BIAS)
        time.sleep_ms(10)  # input RC filter settling: >= 10.5 time constants + 1 ms
        self._write(_CONFIG, self._cfg | _BIAS | _ONE_SHOT)  # conversion starts when CS goes high
        time.sleep_ms(self._conv_ms + 3)
        d = self._read(_RTD_MSB, 2)
        self._write(_CONFIG, self._cfg)  # VBIAS off between readings
        raw = (d[0] << 8) | d[1]
        if raw & 1:
            f = self.fault()
            self.clear_fault()
            raise OSError('MAX31865 fault 0x%02X: check the RTD wiring' % f)
        return raw >> 1

    def resistance(self):
        """RTD resistance in ohms: ADC code x RREF / 2^15."""
        return self.read_raw() * self.rref / 32768

    def temperature(self, r=None):
        """Temperature in C from the Callendar-Van Dusen equation (exact inverse for T >= 0 C,
        Newton iteration including the C term below 0 C)."""
        if r is None:
            r = self.resistance()
        t = (-_A + math.sqrt(_A * _A - 4 * _B * (1 - r / self.r0))) / (2 * _B)
        if t >= 0:
            return t
        for _ in range(8):
            f = self.r0 * (1 + _A * t + _B * t * t + _C * (t - 100) * t ** 3) - r
            df = self.r0 * (_A + 2 * _B * t + _C * (4 * t ** 3 - 300 * t * t))
            t -= f / df
        return t

    def read(self):
        """Measure once and return (resistance in ohms, temperature in C)."""
        r = self.resistance()
        return r, self.temperature(r)
