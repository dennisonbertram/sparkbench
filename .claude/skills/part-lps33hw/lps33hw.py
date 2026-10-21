# LPS33HW water-resistant pressure + temperature sensor (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet DocID030522 Rev 1:
#   I2C address 101110x: 0x5D with SDO/SA0 high, 0x5C with SA0 low.
#   WHO_AM_I 0x0F = 0xB1.
#   CTRL_REG1 0x10: ODR[2:0] bits 6:4, BDU bit 1 (bit 7 must be 0).
#   STATUS 0x27: T_DA bit 1, P_DA bit 0.
#   PRESS_OUT_XL/L/H 0x28-0x2A: 24-bit two's complement, 4096 LSB/hPa.
#   TEMP_OUT_L/H 0x2B-0x2C: 16-bit two's complement, 100 LSB/degC.
# The datasheet (CTRL_REG2 note 1) recommends single-byte reads of the output registers with
# BDU = 1, and PRESS_OUT_H (0x2A) read last so BDU releases the registers for the next sample.
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x10
_STATUS = 0x27
_PRESS_OUT_XL = 0x28
_PRESS_OUT_L = 0x29
_PRESS_OUT_H = 0x2A
_TEMP_OUT_L = 0x2B
_TEMP_OUT_H = 0x2C
_CHIP_ID = 0xB1
_BDU = 0x02

# ODR codes for CTRL_REG1 bits 6:4 (Table 17): 1, 10, 25, 50, 75 Hz.
_ODR = {1: 0b001, 10: 0b010, 25: 0b011, 50: 0b100, 75: 0b101}


class LPS33HW:
    def __init__(self, i2c, addr=0x5D, rate=10):
        """addr 0x5D with SDO/SA0 high (Adafruit default), 0x5C with SDO tied to GND."""
        self.i2c = i2c
        self.addr = addr
        self.period_ms = 1000 // rate
        who = self._r(_WHO_AM_I)
        if who != _CHIP_ID:
            raise OSError('LPS33HW not found (WHO_AM_I=0x%02X, expected 0xB1)' % who)
        # Continuous mode at the chosen rate, low-pass filter off, BDU on, SIM=0. Bit 7 must be 0.
        self.i2c.writeto_mem(addr, _CTRL_REG1, bytes([(_ODR[rate] << 4) | _BDU]))

    def _r(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _wait_ready(self):
        # STATUS: P_DA (bit 0) and T_DA (bit 1) go to 1 when a new sample is available.
        deadline = time.ticks_add(time.ticks_ms(), 2 * self.period_ms + 100)
        while (self._r(_STATUS) & 0x03) != 0x03:
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('LPS33HW: no new data (check wiring and power)')
            time.sleep_ms(5)

    def read(self):
        """Return (pressure in hPa, temperature in degC)."""
        self._wait_ready()
        t = self._r(_TEMP_OUT_L) | (self._r(_TEMP_OUT_H) << 8)
        p = self._r(_PRESS_OUT_XL) | (self._r(_PRESS_OUT_L) << 8)
        p |= self._r(_PRESS_OUT_H) << 16  # read last (BDU)
        if p & 0x800000:
            p -= 1 << 24
        if t & 0x8000:
            t -= 1 << 16
        return p / 4096, t / 100

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, sea_level_hpa=1013.25):
        """Approximate altitude in metres from the international barometric formula."""
        return 44330 * (1 - (self.pressure() / sea_level_hpa) ** 0.1903)
