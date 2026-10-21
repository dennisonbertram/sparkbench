# TOF10120 laser time-of-flight distance sensor (Sharp SPAD ranging module), MicroPython driver, I2C side.
# Datasheet (Shenzhen Hongchengji TOF10120): VDD 3-5 V, 35 mA, range 100-1800 mm, ranging time max 33 ms,
# I2C slave ID 0xA4 by default (8-bit form; 7-bit address 0x52), changeable over UART with "s7-xxx#".
# Reading (vendor example code): write the register pointer 0x00, wait >= 30 us, then read 2 bytes:
#   distance in mm = high byte * 256 + low byte.
# Whether that value is the filtered or the real-time distance is set by the UART command "s3-x#"
# (x=0 filtered, the default; x=1 real-time).
import time

ADDR = 0x52  # 0xA4 >> 1


class TOF10120:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def distance_mm(self):
        """Latest distance in millimetres (the module measures continuously, about every 30 ms)."""
        self.i2c.writeto(self.addr, b'\x00')
        time.sleep_ms(1)  # vendor code: at least 30 us between pointer write and read
        d = self.i2c.readfrom(self.addr, 2)
        return (d[0] << 8) | d[1]

    def distance_cm(self):
        return self.distance_mm() / 10
