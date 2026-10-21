# TLV493D-A1B6 3D magnetic sensor (Infineon), MicroPython driver.
# The chip has no register pointer: every read starts at read register 0 and every write is a raw
# byte stream into write registers 0..3. Start-up follows the Infineon user manual / reference library:
# power up (starts in power-down mode), read all 10 read registers, copy the factory bits into the
# write registers, choose a mode, set the odd-parity bit and write all 4 write registers.
import time

ADDR_HIGH = 0x5E  # ADDR/SDA high at power-up (Adafruit breakout default)
ADDR_LOW = 0x1F   # ADDR/SDA low at power-up

MT_PER_LSB = 0.098   # 12-bit two's complement, 0.098 mT/LSB (datasheet table 10)
T25_LSB = 340        # temperature raw value at 25 degC (datasheet table 8)
DEG_PER_LSB = 1.1    # degC per LSB


def _s12(v):
    return v - 4096 if v & 0x800 else v


class TLV493D:
    def __init__(self, i2c, addr=ADDR_HIGH, reset=True):
        self.i2c = i2c
        self.addr = addr
        if reset:
            # I2C reset: general-call address 0x00; the data byte sets the SDA level the chip samples
            # for its address (0xFF -> 0x5E, 0x00 -> 0x1F), as in Infineon's library.
            try:
                i2c.writeto(0x00, b'\xff' if addr == ADDR_HIGH else b'\x00')
            except OSError:
                pass  # the chip need not acknowledge the reset frame
        time.sleep_ms(40)
        r = i2c.readfrom(addr, 10)
        w = bytearray(4)
        w[0] = 0x00                 # reserved
        w[1] = r[7] & 0x18          # MOD1: factory bits 4:3, IICAddr 00 (keep address), INT off
        w[2] = r[8]                 # reserved factory byte
        w[3] = r[9] & 0x1F          # MOD2: factory bits 4:0
        w[1] |= 0x01                # LOW = 1, FAST = 0 -> low-power mode
        w[3] |= 0x40 | 0x20         # LP period 12 ms (~100 Hz), parity test enabled, temperature on (bit 7 = 0)
        w[1] |= 0x80                # parity bit: all bits of the 4 bytes must have odd parity
        y = w[0] ^ w[1] ^ w[2] ^ w[3]
        y ^= y >> 4
        y ^= y >> 2
        y ^= y >> 1
        if not (y & 1):
            w[1] &= 0x7F
        i2c.writeto(addr, w)
        time.sleep_ms(15)           # first conversion

    def read_raw(self):
        # No shadow registers: only accept a frame whose channel bits are 0 (conversion finished).
        for _ in range(5):
            d = self.i2c.readfrom(self.addr, 7)
            if d[3] & 0x03 == 0:
                break
            time.sleep_ms(2)
        else:
            raise OSError('TLV493D: conversion never finished')
        bx = _s12((d[0] << 4) | (d[4] >> 4))
        by = _s12((d[1] << 4) | (d[4] & 0x0F))
        bz = _s12((d[2] << 4) | (d[5] & 0x0F))
        t = _s12(((d[3] & 0xF0) << 4) | d[6])
        return bx, by, bz, t

    def read(self):
        """Return (Bx, By, Bz) in mT and the chip temperature in degC."""
        bx, by, bz, t = self.read_raw()
        return (bx * MT_PER_LSB, by * MT_PER_LSB, bz * MT_PER_LSB,
                (t - T25_LSB) * DEG_PER_LSB + 25)

    def magnetic(self):
        return self.read()[:3]

    def temperature(self):
        return self.read()[3]
