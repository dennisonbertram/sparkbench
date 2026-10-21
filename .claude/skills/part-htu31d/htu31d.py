# HTU31D temperature & humidity sensor (TE Connectivity HTU31D RH/T sensor IC), MicroPython driver.
# Measurement sequence from the datasheet: send a Conversion command (0x40 | OSR_RH<<3 | OSR_T<<1),
# wait for the conversion, then send Read T&RH (0x00) and read 6 bytes: T MSB, T LSB, CRC, RH MSB, RH LSB, CRC.
# CRC-8: polynomial x^8 + x^5 + x^4 + 1 (0x31), initialisation 0x00.
# Conversion: T = -40 + 165 * S_T / (2^16 - 1) degC, RH = 100 * S_RH / (2^16 - 1) %RH.
import time

_CMD_RESET = 0x1E
_CMD_HEATER_ON = 0x04
_CMD_HEATER_OFF = 0x02
_CMD_READ_T_RH = 0x00
_CMD_READ_RH = 0x10
_CMD_CONVERSION = 0x40
_CMD_READ_DIAG = 0x08
_CMD_READ_SERIAL = 0x0A

# Typical conversion times in ms at OSR 0..3 (datasheet Table 5); the wait adds margin.
_T_CONV_MS = (1.57, 3.06, 6.03, 11.98)
_RH_CONV_MS = (1.11, 2.14, 4.21, 8.34)


def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class HTU31D:
    def __init__(self, i2c, addr=0x40, osr_rh=3, osr_t=3):
        """addr 0x40 with the ADDR pin low (board default), 0x41 with it high.
        osr_rh / osr_t: resolution 0 (fastest) .. 3 (finest, default)."""
        self.i2c = i2c
        self.addr = addr
        self.osr_rh = osr_rh & 3
        self.osr_t = osr_t & 3
        time.sleep_ms(10)  # power-up time, max 10 ms
        self.reset()

    def reset(self):
        """Soft reset (0x1E): back to defaults, heater off. Takes up to 15 ms."""
        self.i2c.writeto(self.addr, bytes([_CMD_RESET]))
        time.sleep_ms(15)

    def heater(self, on):
        self.i2c.writeto(self.addr, bytes([_CMD_HEATER_ON if on else _CMD_HEATER_OFF]))

    def serial_number(self):
        """24-bit serial number (followed by a CRC over the three bytes)."""
        self.i2c.writeto(self.addr, bytes([_CMD_READ_SERIAL]))
        d = self.i2c.readfrom(self.addr, 4)
        if _crc8(d[0:3]) != d[3]:
            raise OSError('HTU31D CRC mismatch: check the wiring')
        return (d[0] << 16) | (d[1] << 8) | d[2]

    def read(self):
        """Measure once and return (temperature in degC, relative humidity in %)."""
        cmd = _CMD_CONVERSION | (self.osr_rh << 3) | (self.osr_t << 1)
        self.i2c.writeto(self.addr, bytes([cmd]))
        wait = _T_CONV_MS[self.osr_t] + _RH_CONV_MS[self.osr_rh]
        time.sleep_ms(int(wait * 1.25) + 2)  # typical times only: leave margin
        self.i2c.writeto(self.addr, bytes([_CMD_READ_T_RH]))
        d = self.i2c.readfrom(self.addr, 6)
        if _crc8(d[0:2]) != d[2] or _crc8(d[3:5]) != d[5]:
            raise OSError('HTU31D CRC mismatch: check the wiring')
        s_t = (d[0] << 8) | d[1]
        s_rh = (d[3] << 8) | d[4]
        t = -40 + 165 * s_t / 65535
        rh = 100 * s_rh / 65535
        return t, rh

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
