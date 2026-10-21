# STS35 high-accuracy temperature sensor (Sensirion STS3x-DIS), MicroPython driver.
# Single-shot, high-repeatability measurement without clock stretching (command 0x2400),
# 3-byte reply (T MSB, T LSB, CRC-8 poly 0x31 init 0xFF), T = -45 + 175 * S / 65535 degC.
import time


def _crc8(data):
    crc = 0xFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class STS35:
    def __init__(self, i2c, addr=0x4B):
        # 0x4A with ADDR low, 0x4B with ADDR high (DFRobot SEN0434 pulls ADDR high: 0x4B).
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(2)  # power-up time tPU is at most 1.5 ms

    def soft_reset(self):
        self.i2c.writeto(self.addr, b'\x30\xa2')
        time.sleep_ms(2)  # soft reset time tSR is at most 1.5 ms

    def read_raw(self):
        self.i2c.writeto(self.addr, b'\x24\x00')
        time.sleep_ms(20)  # high repeatability takes up to 15.5 ms
        d = self.i2c.readfrom(self.addr, 3)
        if _crc8(d[0:2]) != d[2]:
            raise OSError('STS35 CRC mismatch: check the wiring')
        return (d[0] << 8) | d[1]

    def temperature(self):
        """Measure once and return the temperature in degrees C."""
        return -45 + 175 * self.read_raw() / 65535
