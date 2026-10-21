# ENS160 digital metal-oxide multi-gas sensor (ScioSense), MicroPython driver.
# Register map, formats and operating modes from the ScioSense ENS160 datasheet v1.3.
# All multi-byte registers are little endian (LSB at the lower address).
import time

_PART_ID = 0x00        # 2 bytes, reads 0x0160 (0x60, 0x01)
_OPMODE = 0x10         # 0x00 deep sleep, 0x01 idle, 0x02 standard, 0xF0 reset
_CONFIG = 0x11
_COMMAND = 0x12
_TEMP_IN = 0x13        # 2 bytes: (T[°C] + 273.15) * 64
_RH_IN = 0x15          # 2 bytes: RH[%] * 512
_DEVICE_STATUS = 0x20  # bit7 STATAS, bit6 STATER, bits3:2 validity, bit1 NEWDAT, bit0 NEWGPR
_DATA_AQI = 0x21       # bits 2:0 = AQI-UBA 1..5, then TVOC (0x22, ppb) and eCO2 (0x24, ppm)

MODE_DEEP_SLEEP = 0x00
MODE_IDLE = 0x01
MODE_STANDARD = 0x02
_MODE_RESET = 0xF0

VALIDITY = ('normal', 'warm-up', 'initial start-up', 'invalid')


class ENS160:
    def __init__(self, i2c, addr=0x53):
        """addr 0x53 with ADDR/SDO high (Adafruit default), 0x52 with it tied to GND."""
        self.i2c = i2c
        self.addr = addr
        self.validity = 3
        pid = self.i2c.readfrom_mem(self.addr, _PART_ID, 2)
        if pid[0] | (pid[1] << 8) != 0x0160:
            raise OSError('ENS160 not found (PART_ID 0x%04X)' % (pid[0] | (pid[1] << 8)))
        self._mode(_MODE_RESET)
        time.sleep_ms(10)
        self._mode(MODE_IDLE)
        time.sleep_ms(10)
        self._mode(MODE_STANDARD)
        time.sleep_ms(50)

    def _mode(self, m):
        self.i2c.writeto_mem(self.addr, _OPMODE, bytes([m]))

    def sleep(self):
        """Deep sleep (about 10 µA); call wake() to resume gas sensing."""
        self._mode(MODE_DEEP_SLEEP)

    def wake(self):
        self._mode(MODE_STANDARD)
        time.sleep_ms(50)

    def set_compensation(self, temp_c, rh):
        """Tell the sensor the ambient temperature (°C) and humidity (%) for better accuracy."""
        t = int((temp_c + 273.15) * 64 + 0.5) & 0xFFFF
        h = int(rh * 512 + 0.5) & 0xFFFF
        # LSB first: the chip takes the new value when the MSB is written.
        self.i2c.writeto_mem(self.addr, _TEMP_IN, bytes([t & 0xFF, t >> 8, h & 0xFF, h >> 8]))

    def status(self):
        return self.i2c.readfrom_mem(self.addr, _DEVICE_STATUS, 1)[0]

    def read(self, timeout_ms=3000):
        """Wait for new data (one result per second in standard mode) and return
        (AQI-UBA 1-5, TVOC in ppb, eCO2 in ppm). self.validity is set from the status:
        0 normal, 1 warm-up (first 3 min), 2 initial start-up (first hour ever), 3 invalid."""
        t0 = time.ticks_ms()
        while True:
            st = self.status()
            if st & 0x40:
                raise OSError('ENS160 error flag (STATER) set')
            if st & 0x02:
                break
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                raise OSError('ENS160: no new data (is it in standard mode?)')
            time.sleep_ms(50)
        self.validity = (st >> 2) & 0x03
        d = self.i2c.readfrom_mem(self.addr, _DATA_AQI, 5)
        aqi = d[0] & 0x07
        tvoc = d[1] | (d[2] << 8)
        eco2 = d[3] | (d[4] << 8)
        return aqi, tvoc, eco2
