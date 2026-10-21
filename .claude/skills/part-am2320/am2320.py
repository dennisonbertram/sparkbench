# AM2320 temperature & humidity sensor (Aosong AM2320), MicroPython driver for its I2C mode.
# Datasheet sequence: wake the sensor (address byte, which it does NOT acknowledge), send
# function 0x03 "read registers" from 0x00 for 4 registers, wait >= 1.5 ms, then read
# 8 bytes: 0x03, 0x04, RH high, RH low, T high, T low, CRC low, CRC high.
# CRC-16/Modbus (init 0xFFFF, poly 0xA001 reflected) over the first 6 bytes, sent low byte first.
# Humidity = raw / 10 %RH. Temperature: bit 15 = sign (1 = negative), bits 14..0 = |T| x 10.
# Bus speed must be 100 kHz or less. Read no more often than once every 2 s.
import time

ADDR = 0x5C  # 0xB8 in the datasheet's 8-bit (address + R/W) notation


def _crc16(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


class AM2320:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def _wake(self):
        # The sensor sleeps between reads and does not ACK the wake-up address byte,
        # so the write normally raises OSError: that is expected.
        try:
            self.i2c.writeto(self.addr, b'')
        except OSError:
            pass
        time.sleep_ms(1)  # datasheet: hold >= 800 us (max 3 ms) before it is awake

    def read(self):
        """Return (temperature in °C, relative humidity in %).

        The sensor starts a new measurement each time it is read, so a reading
        reflects the previous read; wait at least 2 s between calls.
        """
        self._wake()
        try:
            self.i2c.writeto(self.addr, b'\x03\x00\x04')
        except OSError:
            # Some ports need a second attempt right after waking the sensor.
            time.sleep_ms(1)
            self.i2c.writeto(self.addr, b'\x03\x00\x04')
        time.sleep_ms(2)  # datasheet: wait at least 1.5 ms before reading
        d = self.i2c.readfrom(self.addr, 8)
        if d[0] != 0x03 or d[1] != 0x04:
            raise OSError('AM2320 bad reply header: check the wiring and pull-ups')
        if _crc16(d[0:6]) != (d[6] | (d[7] << 8)):
            raise OSError('AM2320 CRC mismatch: check the wiring and pull-ups')
        h_raw = (d[2] << 8) | d[3]
        t_raw = (d[4] << 8) | d[5]
        t = (t_raw & 0x7FFF) / 10
        if t_raw & 0x8000:
            t = -t
        return t, h_raw / 10

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
