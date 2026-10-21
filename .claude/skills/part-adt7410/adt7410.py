# ADT7410 16-bit I2C temperature sensor (Analog Devices), MicroPython driver.
# Written from the ADT7410 data sheet Rev. C: register 0x00/0x01 = temperature MSB/LSB
# (twos complement, MSB first, pointer auto-increments), 0x03 = configuration,
# 0x0B = ID (bits 7:3 = 11001). 16-bit mode: T = code / 128 (code signed);
# 13-bit mode: T = (code >> 3) / 16, bits 2:0 are TCRIT/THIGH/TLOW flags.
import time

_REG_TEMP = 0x00
_REG_CONFIG = 0x03
_REG_ID = 0x0B


class ADT7410:
    def __init__(self, i2c, addr=0x48, high_res=True):
        self.i2c = i2c
        self.addr = addr
        if (self.i2c.readfrom_mem(addr, _REG_ID, 1)[0] & 0xF8) != 0xC8:
            raise OSError('ADT7410 not found at 0x%02X: check the wiring and A0/A1' % addr)
        self.high_res = high_res
        # Bit 7 = resolution (1 = 16-bit), bits 6:5 = 00 continuous conversion.
        self.i2c.writeto_mem(addr, _REG_CONFIG, bytes([0x80 if high_res else 0x00]))
        time.sleep_ms(250)  # a conversion takes 240 ms (typ) in continuous mode

    def temperature(self):
        """Last converted temperature in °C."""
        d = self.i2c.readfrom_mem(self.addr, _REG_TEMP, 2)
        code = (d[0] << 8) | d[1]
        if code & 0x8000:
            code -= 65536
        if self.high_res:
            return code / 128
        return (code >> 3) / 16  # arithmetic shift keeps the sign; drops the 3 flag bits
