# Honeywell HumidIcon HIH6130/6131 humidity & temperature sensor, MicroPython driver.
# From Honeywell's technical note "I2C Communication with the Honeywell HumidIcon Digital
# Humidity/Temperature Sensors: HIH-6130/6131 Series":
#  - Measurement Request (MR): the slave address with the WRITE bit and no data bytes, then STOP.
#  - The measurement cycle takes typically 36.65 ms.
#  - Data Fetch (DF): read 4 bytes: [S1 S0 H13..H8] [H7..H0] [T13..T6] [T5..T0 x x].
#  - Status S1S0: 00 = valid new data, 01 = stale data, 10 = command mode, 11 = diagnostic fault.
#  - RH = count * 100 / (2^14 - 1) %;  T = count * 165 / (2^14 - 1) - 40 degC.
import time

_DENOM = 16383  # 2^14 - 1


class HIH6130:
    def __init__(self, i2c, addr=0x27):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(60)  # power-on to data ready: max 60 ms

    def _fetch(self):
        return self.i2c.readfrom(self.addr, 4)

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        self.i2c.writeto(self.addr, b'')  # Measurement Request: address + W only
        time.sleep_ms(40)  # measurement cycle is typically 36.65 ms
        for _ in range(10):
            d = self._fetch()
            status = d[0] >> 6
            if status == 0:
                break
            if status == 3:
                raise OSError('HIH6130 diagnostic condition (EEPROM fault)')
            if status == 2:
                raise OSError('HIH6130 is in command mode')
            time.sleep_ms(10)  # 01 = stale: the conversion has not finished yet
        else:
            raise OSError('HIH6130 data stayed stale: check the wiring')
        h_raw = ((d[0] & 0x3F) << 8) | d[1]
        t_raw = (d[2] << 6) | (d[3] >> 2)
        return t_raw * 165 / _DENOM - 40, h_raw * 100 / _DENOM

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
