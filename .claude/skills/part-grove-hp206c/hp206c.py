# HP206C precision barometer / altimeter (HopeRF), MicroPython driver.
# Command-based I2C protocol from the HP206C datasheet: SOFT_RST 0x06, ADC_CVT 010_dsr_chnl,
# READ_PT 0x10 (6 bytes: 24-bit temperature then 24-bit pressure, MSB first), READ_P 0x30,
# READ_A 0x31, READ_T 0x32, READ_REG 10_addr, WRITE_REG 11_addr.
# With compensation on (PARA.CMPS_EN, the power-on default) results are 24-bit two's complement:
# temperature in 0.01 degC, pressure in 0.01 mbar (= Pa), altitude in 0.01 m.
import time

SOFT_RST = 0x06
ADC_CVT = 0x40
READ_PT = 0x10
READ_AT = 0x11
READ_P = 0x30
READ_A = 0x31
READ_T = 0x32
ANA_CAL = 0x28
READ_REG = 0x80
WRITE_REG = 0xC0

REG_INT_SRC = 0x0D  # bit 6 DEV_RDY
REG_PARA = 0x0E     # bit 7 CMPS_EN

# DSR code -> conversion time in ms for temperature AND pressure (datasheet table 6), rounded up
_DSR = {4096: (0, 132), 2048: (1, 66), 1024: (2, 33), 512: (3, 17), 256: (4, 9), 128: (5, 5)}


def _s24(b):
    v = (b[0] << 16) | (b[1] << 8) | b[2]
    return v - 0x1000000 if v & 0x800000 else v


class HP206C:
    def __init__(self, i2c, addr=0x76, dsr=1024):
        # Grove board ties CSB high: address 0x76 (0x77 with CSB low)
        self.i2c = i2c
        self.addr = addr
        self._dsr, self._conv_ms = _DSR[dsr]
        self.reset()

    def _cmd(self, c):
        self.i2c.writeto(self.addr, bytes([c]))

    def read_reg(self, reg):
        self._cmd(READ_REG | (reg & 0x3F))
        return self.i2c.readfrom(self.addr, 1)[0]

    def write_reg(self, reg, val):
        self.i2c.writeto(self.addr, bytes([WRITE_REG | (reg & 0x3F), val & 0xFF]))

    def _wait_ready(self, timeout_ms=200):
        t0 = time.ticks_ms()
        while not (self.read_reg(REG_INT_SRC) & 0x40):
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('HP206C not ready: check the wiring')
            time.sleep_ms(2)

    def reset(self):
        """Soft reset (power-up sequence, about 0.4 ms), then make sure compensation is on."""
        self._cmd(SOFT_RST)
        time.sleep_ms(10)
        self._wait_ready()
        self.write_reg(REG_PARA, 0x80)  # CMPS_EN = 1: fully compensated outputs

    def _convert(self, chnl):
        # chnl 0b00 = pressure + temperature, 0b10 = temperature only
        self._cmd(ADC_CVT | (self._dsr << 2) | chnl)
        time.sleep_ms(self._conv_ms if chnl == 0 else self._conv_ms // 2 + 1)
        self._wait_ready()

    def read(self):
        """Measure once; return (temperature degC, pressure mbar/hPa)."""
        self._convert(0)
        self._cmd(READ_PT)
        d = self.i2c.readfrom(self.addr, 6)
        return _s24(d[0:3]) / 100, _s24(d[3:6]) / 100

    def temperature(self):
        self._convert(2)
        self._cmd(READ_T)
        return _s24(self.i2c.readfrom(self.addr, 3)) / 100

    def pressure(self):
        return self.read()[1]

    def altitude(self):
        """Altitude in m computed by the chip from the last P+T conversion (set ALT_OFF for your local pressure)."""
        self._convert(0)
        self._cmd(READ_A)
        return _s24(self.i2c.readfrom(self.addr, 3)) / 100

    def set_altitude_offset(self, metres):
        """ALT_OFF registers 0x00 (LSB) / 0x01 (MSB): 16-bit two's complement, centimetres."""
        v = int(round(metres * 100)) & 0xFFFF
        self.write_reg(0x00, v & 0xFF)
        self.write_reg(0x01, v >> 8)
