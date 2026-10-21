# Honeywell MPRLS (MPR series, I2C) pressure sensor, MicroPython driver.
# Written from the Honeywell MPR Series datasheet (32332628):
#  - I2C address 0x18; output measurement command 0xAA 0x00 0x00.
#  - Wait for the busy flag (status bit 5) to clear, or >= 5 ms, or EOC high.
#  - Read 4 bytes: status, then 24-bit pressure counts (MSB first).
#  - Status: bit 6 = powered (must be 1), bit 5 = busy, bit 2 = memory integrity
#    error, bit 0 = math saturation.
#  - Transfer function A (10 % to 90 % of 2^24 counts):
#    P = (counts - 1677722) * (Pmax - Pmin) / (15099494 - 1677722) + Pmin
# The Adafruit breakout uses the 0-25 psi absolute part (MPRLS0025PA00001A).
import time

OUTPUT_MIN = 1677722   # 0x19999A, 10 % of 2^24
OUTPUT_MAX = 15099494  # 0xE66666, 90 % of 2^24
PSI_TO_HPA = 68.947572932

_POWERED = 0x40
_BUSY = 0x20
_MEM_ERR = 0x04
_MATH_SAT = 0x01


class MPRLS:
    def __init__(self, i2c, addr=0x18, psi_min=0.0, psi_max=25.0, eoc=None):
        self.i2c = i2c
        self.addr = addr
        self.psi_min = psi_min
        self.psi_max = psi_max
        self.eoc = eoc  # optional machine.Pin (input) wired to EOC
        time.sleep_ms(3)  # power up to data ready: 2.5 ms max

    def status(self):
        return self.i2c.readfrom(self.addr, 1)[0]

    def read_raw(self):
        """Run one measurement and return the 24-bit pressure counts."""
        self.i2c.writeto(self.addr, b'\xaa\x00\x00')
        t0 = time.ticks_ms()
        time.sleep_ms(5)  # datasheet option 2: at least 5 ms per conversion
        while True:
            if self.eoc is not None:
                done = self.eoc.value()
            else:
                done = not (self.status() & _BUSY)
            if done:
                break
            if time.ticks_diff(time.ticks_ms(), t0) > 50:
                raise OSError('MPRLS timeout: sensor stayed busy')
            time.sleep_ms(1)
        d = self.i2c.readfrom(self.addr, 4)
        st = d[0]
        if not st & _POWERED:
            raise OSError('MPRLS not powered (status 0x%02x)' % st)
        if st & _MEM_ERR:
            raise OSError('MPRLS memory integrity error')
        if st & _MATH_SAT:
            raise OSError('MPRLS math saturation (pressure out of range)')
        return (d[1] << 16) | (d[2] << 8) | d[3]

    def pressure_psi(self):
        raw = self.read_raw()
        return (raw - OUTPUT_MIN) * (self.psi_max - self.psi_min) / (OUTPUT_MAX - OUTPUT_MIN) + self.psi_min

    def pressure_hpa(self):
        return self.pressure_psi() * PSI_TO_HPA
