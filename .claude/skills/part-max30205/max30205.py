# MAX30205 human body temperature sensor (Maxim/Analog Devices), MicroPython driver.
# Written from the MAX30205 datasheet (Rev 0): four 16-bit registers behind a pointer byte,
# temperature = 16-bit two's complement, MSB first, 1 LSB = 0.00390625 degC (normal format).
import time

REG_TEMP = 0x00   # read-only temperature
REG_CONFIG = 0x01  # 8-bit configuration
REG_THYST = 0x02  # hysteresis set point (POR 75 degC)
REG_TOS = 0x03    # overtemperature set point (POR 80 degC)

_SHUTDOWN = 0x01
_ONE_SHOT = 0x80
_LSB = 0.00390625


def _to_c(raw):
    if raw & 0x8000:
        raw -= 0x10000
    return raw * _LSB


def _from_c(c):
    return int(round(c / _LSB)) & 0xFFFF


class MAX30205:
    def __init__(self, i2c, addr=0x48):
        """addr 0x48 = A0, A1, A2 all tied to GND (datasheet Table 1, 90h)."""
        self.i2c = i2c
        self.addr = addr
        # Continuous conversion, comparator mode, OS active low, 1 fault,
        # normal data format, bus timeout enabled (the power-on defaults).
        self.i2c.writeto_mem(self.addr, REG_CONFIG, b'\x00')
        time.sleep_ms(50)  # one conversion takes up to 50 ms

    def temperature(self):
        """Latest temperature in degC (continuous mode, a new value every ~50 ms)."""
        d = self.i2c.readfrom_mem(self.addr, REG_TEMP, 2)
        return _to_c((d[0] << 8) | d[1])

    def shutdown(self, off=True):
        """Shutdown mode draws <= 3.5 uA; leaving it starts a new conversion."""
        self.i2c.writeto_mem(self.addr, REG_CONFIG, bytes([_SHUTDOWN if off else 0x00]))

    def one_shot(self):
        """Low-power reading: in shutdown, set ONE-SHOT, wait one conversion, read."""
        self.i2c.writeto_mem(self.addr, REG_CONFIG, bytes([_SHUTDOWN]))
        self.i2c.writeto_mem(self.addr, REG_CONFIG, bytes([_ONE_SHOT | _SHUTDOWN]))
        time.sleep_ms(50)
        return self.temperature()

    def set_alarm(self, t_os, t_hyst):
        """OS pin asserts above t_os and releases below t_hyst (comparator mode)."""
        self.i2c.writeto_mem(self.addr, REG_TOS, _from_c(t_os).to_bytes(2, 'big'))
        self.i2c.writeto_mem(self.addr, REG_THYST, _from_c(t_hyst).to_bytes(2, 'big'))
