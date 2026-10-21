# MPL3115A2 pressure / altitude / temperature sensor (NXP), MicroPython driver.
# Barometer mode, one-shot measurements with 128x oversampling, as in the NXP datasheet
# (Rev. 8.1, sections 12, 14.1-14.4, 14.12, 14.22). I2C address 0x60, WHO_AM_I (0x0C) = 0xC4.
# Pressure: OUT_P (0x01-0x03) is a 20-bit unsigned Q18.2 value in Pa, left-justified (bits 7..4 of 0x03).
# Temperature: OUT_T (0x04-0x05) is a 12-bit signed Q8.4 value in degC, left-justified (bits 7..4 of 0x05).
import time

_STATUS = 0x00
_OUT_P_MSB = 0x01
_WHO_AM_I = 0x0C
_PT_DATA_CFG = 0x13
_CTRL_REG1 = 0x26

_OS128 = 0x38      # CTRL_REG1 OS[2:0] = 111 (128x), ALT = 0 (barometer), SBYB = 0 (standby)
_OST = 0x02        # CTRL_REG1 one-shot trigger (auto-clears when the measurement is done)
_PTDR = 0x08       # STATUS: new pressure/temperature data ready


class MPL3115A2:
    def __init__(self, i2c, addr=0x60, sea_level_pa=101326):
        self.i2c = i2c
        self.addr = addr
        self.sea_level_pa = sea_level_pa
        who = self.i2c.readfrom_mem(addr, _WHO_AM_I, 1)[0]
        if who != 0xC4:
            raise OSError('MPL3115A2 not found (WHO_AM_I=0x%02X, expected 0xC4)' % who)
        # CTRL_REG1 may only be changed in standby (SBYB = 0): barometer mode, 128x oversampling.
        self.i2c.writeto_mem(addr, _CTRL_REG1, bytes([_OS128]))
        # Enable data-ready flags for pressure and temperature (DREM | PDEFE | TDEFE).
        self.i2c.writeto_mem(addr, _PT_DATA_CFG, b'\x07')

    def read(self):
        """Measure once; return (pressure in Pa, temperature in degC)."""
        # Reading OUT_P_MSB / OUT_T_MSB clears any stale data-ready flags.
        self.i2c.readfrom_mem(self.addr, _OUT_P_MSB, 5)
        # Start a one-shot conversion (stays in standby afterwards).
        self.i2c.writeto_mem(self.addr, _CTRL_REG1, bytes([_OS128 | _OST]))
        # 128x oversampling takes up to 512 ms.
        t0 = time.ticks_ms()
        while not (self.i2c.readfrom_mem(self.addr, _STATUS, 1)[0] & _PTDR):
            if time.ticks_diff(time.ticks_ms(), t0) > 1000:
                raise OSError('MPL3115A2 measurement timed out')
            time.sleep_ms(10)
        d = self.i2c.readfrom_mem(self.addr, _OUT_P_MSB, 5)
        p_raw = ((d[0] << 16) | (d[1] << 8) | d[2]) >> 4   # Q18.2
        t_raw = ((d[3] << 8) | d[4]) >> 4                  # Q8.4, two's complement
        if t_raw & 0x800:
            t_raw -= 0x1000
        return p_raw / 4, t_raw / 16

    def pressure(self):
        return self.read()[0]

    def temperature(self):
        return self.read()[1]

    def altitude(self, pressure_pa=None):
        """Altitude in metres from the standard-atmosphere formula, referenced to sea_level_pa."""
        if pressure_pa is None:
            pressure_pa = self.read()[0]
        return 44330.77 * (1 - (pressure_pa / self.sea_level_pa) ** 0.1902632)
