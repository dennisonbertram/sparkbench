# ADXL362 micropower 3-axis accelerometer (Analog Devices), MicroPython driver.
# SPI mode 0 (CPOL = CPHA = 0), 1-5 MHz recommended. Commands per the datasheet:
#   0x0A <addr> <data...>  write register(s)
#   0x0B <addr>            read register(s), address auto-increments
# Data: XDATA_L..ZDATA_H (0x0E-0x13) are 12-bit two's complement values, low byte
# first, sign-extended to 16 bits; TEMP_L/TEMP_H (0x14-0x15) likewise.
from machine import Pin
import time

_WRITE = 0x0A
_READ = 0x0B
_DEVID_AD = 0x00
_XDATA_L = 0x0E
_SOFT_RESET = 0x1F
_FILTER_CTL = 0x2C
_POWER_CTL = 0x2D

_MG_PER_LSB = {2: 1, 4: 2, 8: 4}
_RANGE_BITS = {2: 0x00, 4: 0x40, 8: 0x80}


def _s16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


class ADXL362:
    def __init__(self, spi, cs, g_range=2, odr_bits=0x03):
        """spi: machine.SPI in mode 0; cs: GPIO number of CS. g_range 2, 4 or 8.
        odr_bits 0x03 = 100 Hz (datasheet reset default)."""
        if g_range not in _MG_PER_LSB:
            raise ValueError('g_range must be 2, 4 or 8')
        self.spi = spi
        self.cs = Pin(cs, Pin.OUT, value=1)
        self.g_range = g_range
        self._write(_SOFT_RESET, 0x52)  # 'R': reset, all registers cleared, standby
        time.sleep_ms(10)
        ident = self._read(_DEVID_AD, 3)
        if ident[0] != 0xAD or ident[1] != 0x1D or ident[2] != 0xF2:
            raise OSError('ADXL362 not found (ID %02x %02x %02x): check wiring' % (ident[0], ident[1], ident[2]))
        # FILTER_CTL: range bits [7:6], HALF_BW = 1 (bit 4), ODR [2:0]
        self._write(_FILTER_CTL, _RANGE_BITS[g_range] | 0x10 | (odr_bits & 0x07))
        self._write(_POWER_CTL, 0x02)  # MEASURE = 10: measurement mode, normal noise
        time.sleep_ms(50)  # first valid data after 4/ODR (40 ms at 100 Hz)

    def _write(self, reg, val):
        self.cs.value(0)
        self.spi.write(bytes((_WRITE, reg, val)))
        self.cs.value(1)

    def _read(self, reg, n):
        # One full-duplex transfer: command, address, then n dummy bytes while the chip
        # clocks the registers out on MISO (address auto-increments).
        tx = bytearray(2 + n)
        tx[0] = _READ
        tx[1] = reg
        rx = bytearray(2 + n)
        self.cs.value(0)
        self.spi.write_readinto(tx, rx)
        self.cs.value(1)
        return rx[2:]

    def read_raw(self):
        """(x, y, z, temp) raw counts from one burst read, so all axes are from the same sample."""
        d = self._read(_XDATA_L, 8)
        return (_s16(d[0], d[1]), _s16(d[2], d[3]), _s16(d[4], d[5]), _s16(d[6], d[7]))

    def acceleration(self):
        """(x, y, z) in g. 1 mg/LSB at +/-2 g, 2 mg at +/-4 g, 4 mg at +/-8 g."""
        x, y, z, _ = self.read_raw()
        k = _MG_PER_LSB[self.g_range] / 1000
        return x * k, y * k, z * k

    def temperature(self):
        """Approximate die temperature in degC from the datasheet's TYPICAL figures
        (350 LSB at 25 degC, 0.065 degC/LSB). Uncalibrated: the bias varies by
        +/-290 LSB part to part, so calibrate against a known temperature."""
        t = self.read_raw()[3]
        return 25 + (t - 350) * 0.065
