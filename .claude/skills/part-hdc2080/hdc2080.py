# HDC2080 temperature & humidity sensor (Texas Instruments), MicroPython driver.
# Written from the TI datasheet (SNAS678C): on-demand mode (AMM = 000), 14-bit T and RH.
# Registers are 8 bits wide with auto-increment; results are 16-bit words sent LSB first
# (0x00 = T low, 0x01 = T high, 0x02 = RH low, 0x03 = RH high), the 2 lowest bits always 0.
import time

_ADDR = 0x40          # ADDR pin to GND or open; 0x41 with ADDR to VDD
_REG_TEMP_L = 0x00
_REG_INT_CONF = 0x0E  # SOFT_RES, AMM[2:0], HEAT_EN, DRDY/INT_EN, INT_POL, INT_MODE
_REG_MEAS_CONF = 0x0F # TRES[1:0], HRES[1:0], RES, MEAS_CONF[1:0], MEAS_TRIG
_REG_MANUF_ID_L = 0xFC
_MANUF_ID = 0x5449
_DEVICE_ID = 0x07D0
_MEAS_START = 0x01    # TRES = 14 bit, HRES = 14 bit, MEAS_CONF = humidity + temperature, MEAS_TRIG = 1


class HDC2080:
    def __init__(self, i2c, addr=_ADDR, vdd=None):
        """vdd: optional supply voltage, to apply the datasheet's PSRR correction (Equation 2)."""
        self.i2c = i2c
        self.addr = addr
        self.vdd = vdd
        time.sleep_ms(3)  # the sensor needs at most 3 ms after power-up
        ids = self.i2c.readfrom_mem(self.addr, _REG_MANUF_ID_L, 4)
        manuf = ids[0] | (ids[1] << 8)
        dev = ids[2] | (ids[3] << 8)
        if manuf != _MANUF_ID or dev != _DEVICE_ID:
            raise OSError('HDC2080 not found at 0x%02x (IDs %04x/%04x): check the wiring' % (addr, manuf, dev))
        # Auto measurement off, heater off, DRDY/INT pin high-Z: measurements start over I2C.
        self.i2c.writeto_mem(self.addr, _REG_INT_CONF, bytes([0x00]))

    def read(self):
        """Measure once and return (temperature in °C, relative humidity in %)."""
        self.i2c.writeto_mem(self.addr, _REG_MEAS_CONF, bytes([_MEAS_START]))
        # Conversion: 610 µs (T, 14 bit) + 660 µs (RH, 14 bit) typical; wait well past it.
        time.sleep_ms(10)
        d = self.i2c.readfrom_mem(self.addr, _REG_TEMP_L, 4)  # LSB first, as the datasheet requires
        t_raw = d[0] | (d[1] << 8)
        h_raw = d[2] | (d[3] << 8)
        # Datasheet Equation 1: T = raw / 2^16 * 165 - 40.5 °C; Equation 3: RH = raw / 2^16 * 100 %
        t = t_raw * 165 / 65536 - 40.5
        if self.vdd is not None:
            t += 0.08 * (self.vdd - 1.8)  # Equation 2: TEMP_PSRR = 0.08 °C/V for supplies above 1.8 V
        return t, h_raw * 100 / 65536

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
