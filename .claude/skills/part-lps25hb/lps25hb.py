# LPS25HB barometric pressure + temperature sensor (STMicroelectronics), MicroPython driver.
# Written from the ST datasheet DocID027112 Rev 4:
#   WHO_AM_I 0x0F = 0xBD, CTRL_REG1 0x20 (PD bit 7, ODR[2:0] bits 6:4), STATUS_REG 0x27 (P_DA bit 1, T_DA bit 0),
#   PRESS_OUT_XL/L/H 0x28-0x2A: 24-bit two's complement, 4096 LSB/hPa,
#   TEMP_OUT_L/H 0x2B-0x2C: 16-bit two's complement, 480 LSB/degC, T = 42.5 + TEMP_OUT / 480
#   (offset from ST's LPS25H datasheet and ST's lps25hb driver).
# I2C multi-byte reads only auto-increment when bit 7 of the register address (SUB(7)) is 1,
# so the 5-byte burst is read from 0x28 | 0x80 = 0xA8.
import time

_WHO_AM_I = 0x0F
_CTRL_REG1 = 0x20
_STATUS = 0x27
_PRESS_OUT_XL = 0x28
_AUTO_INC = 0x80
_CHIP_ID = 0xBD

# ODR codes for CTRL_REG1 bits 6:4 (Table 20): 1, 7, 12.5, 25 Hz.
_ODR = {1: 0b001, 7: 0b010, 12: 0b011, 25: 0b100}


class LPS25HB:
    def __init__(self, i2c, addr=0x5D, rate=7):
        """addr 0x5D with SA0/SDO high (Adafruit default), 0x5C with SDO tied to GND.
        rate: 1, 7, 12 (12.5 Hz) or 25 samples per second."""
        self.i2c = i2c
        self.addr = addr
        self.period_ms = 1000 // rate
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != _CHIP_ID:
            raise OSError('LPS25HB not found (WHO_AM_I=0x%02X, expected 0xBD)' % who)
        # PD=1 (active), continuous mode at the chosen ODR, DIFF_EN=0, BDU=0 (the 5-byte burst is read
        # right after data-ready, well inside one sample period), RESET_AZ=0, SIM=0.
        self.i2c.writeto_mem(addr, _CTRL_REG1, bytes([0x80 | (_ODR[rate] << 4)]))

    def _wait_ready(self):
        # STATUS_REG: P_DA (bit 1) and T_DA (bit 0) go to 1 when a new sample is available.
        deadline = time.ticks_add(time.ticks_ms(), 2 * self.period_ms + 100)
        while (self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & 0x03) != 0x03:
            if time.ticks_diff(deadline, time.ticks_ms()) < 0:
                raise OSError('LPS25HB: no new data (check wiring and power)')
            time.sleep_ms(5)

    def read(self):
        """Return (pressure in hPa, temperature in degC)."""
        self._wait_ready()
        d = self.i2c.readfrom_mem(self.addr, _PRESS_OUT_XL | _AUTO_INC, 5)
        p = d[0] | (d[1] << 8) | (d[2] << 16)
        if p & 0x800000:
            p -= 1 << 24
        t = d[3] | (d[4] << 8)
        if t & 0x8000:
            t -= 1 << 16
        return p / 4096, 42.5 + t / 480

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, sea_level_hpa=1013.25):
        """Approximate altitude in metres from the international barometric formula."""
        return 44330 * (1 - (self.pressure() / sea_level_hpa) ** 0.1903)
