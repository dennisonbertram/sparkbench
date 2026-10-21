# DHT12 temperature & humidity sensor (Aosong DHT12), MicroPython driver for its I2C mode.
# Datasheet (section 8.1): I2C address 0xB8 in 8-bit notation = 0x5C (7-bit). Read sequence:
# START, DEV SEL + W, BYTE ADDR 0x00, repeated START, DEV SEL + R, 5 data bytes, NACK, STOP.
#   0x00 humidity integer, 0x01 humidity tenths, 0x02 temperature integer,
#   0x03 temperature tenths (bit 7 = 1 means the temperature is negative), 0x04 checksum.
# Checksum = (byte0 + byte1 + byte2 + byte3) & 0xFF.
# Bus speed 400 kHz max; SDA and SCL each need a 1-10 kOhm pull-up (the bare sensor has none).
# SCL must be high at power-up or the sensor chooses its single-wire (DHT11-style) mode.
# Wait 2 s after power-up; read at most once every 2 s. Each read returns the previous measurement.
import time

ADDR = 0x5C  # 0xB8 in the datasheet's 8-bit (address + R/W) notation


class DHT12:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def read(self):
        """Return (temperature in °C, relative humidity in %)."""
        d = self.i2c.readfrom_mem(self.addr, 0x00, 5)
        if (d[0] + d[1] + d[2] + d[3]) & 0xFF != d[4]:
            raise OSError('DHT12 checksum mismatch: check the wiring and pull-ups')
        h = d[0] + d[1] / 10
        t = d[2] + (d[3] & 0x7F) / 10
        if d[3] & 0x80:
            t = -t
        return t, h

    def temperature(self):
        return self.read()[0]

    def humidity(self):
        return self.read()[1]
