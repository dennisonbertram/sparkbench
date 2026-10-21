# M5Stack Unit Ultrasonic-I2C (RCWL-9620 ultrasonic ranging chip), MicroPython driver.
# RCWL-9620 datasheet, I2C mode: address 0x57. Write command 0x01 to start a measurement,
# wait at least 100 ms (the chip's longest measurement time), then read 3 bytes
# BYTE_H, BYTE_M, BYTE_L: distance = ((BYTE_H << 16) + (BYTE_M << 8) + BYTE_L) / 1000 mm.
import time

MAX_MM = 4500  # M5Stack's specified range is 20-4500 mm


class RCWL9620:
    def __init__(self, i2c, addr=0x57):
        self.i2c = i2c
        self.addr = addr

    def distance_mm(self):
        """Start one measurement and return the distance in millimetres (capped at 4500)."""
        self.i2c.writeto(self.addr, b'\x01')
        time.sleep_ms(120)  # datasheet: wait 100 ms or more before reading
        d = self.i2c.readfrom(self.addr, 3)
        mm = ((d[0] << 16) | (d[1] << 8) | d[2]) / 1000
        return MAX_MM if mm > MAX_MM else mm

    def distance_cm(self):
        return self.distance_mm() / 10
