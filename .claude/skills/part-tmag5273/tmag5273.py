# TMAG5273 3D linear Hall-effect sensor (Texas Instruments), MicroPython driver.
# Written from the TI TMAG5273 datasheet (SLYS045C):
#  - registers: DEVICE_CONFIG_1 0x00, DEVICE_CONFIG_2 0x01, SENSOR_CONFIG_1 0x02,
#    SENSOR_CONFIG_2 0x03, T_CONFIG 0x07, DEVICE_ID 0x0D, MANUFACTURER_ID 0x0E/0x0F ("TI" = 0x5449),
#    T/X/Y/Z results 0x10..0x17 (16-bit two's complement, MSB first), CONV_STATUS 0x18
#  - standard 3-byte I2C read: the register byte's bit 7 is the conversion trigger, so it is kept 0 here
#  - B = raw / 2^16 * 2 * BR (Equation 10), BR = 40/80 mT (A1) or 133/266 mT (A2)
#  - T = 25 + (raw - 17508) / 58 degC (Equation 12, TSENS_T0, TADC_T0, TADC_RES)
import time

_DEVICE_CONFIG_1 = 0x00
_DEVICE_CONFIG_2 = 0x01
_SENSOR_CONFIG_1 = 0x02
_SENSOR_CONFIG_2 = 0x03
_T_CONFIG = 0x07
_DEVICE_ID = 0x0D
_MANUFACTURER_ID_LSB = 0x0E
_T_MSB_RESULT = 0x10
_CONV_STATUS = 0x18

_TADC_T0 = 17508
_TADC_RES = 58.0
_TSENS_T0 = 25.0


def _s16(hi, lo):
    v = (hi << 8) | lo
    return v - 0x10000 if v & 0x8000 else v


class TMAG5273:
    def __init__(self, i2c, addr=0x35, wide_range=False, avg=5):
        """addr: 0x35 for TMAG5273A1/A2 (Adafruit board default).
        wide_range: False = +-40 mT (A1) / +-133 mT (A2); True = +-80 mT / +-266 mT.
        avg: CONV_AVG 0..5 (1x..32x averaging)."""
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(1)  # tstart_power_up 270 us
        mid = self.i2c.readfrom_mem(addr, _MANUFACTURER_ID_LSB, 2)
        if mid[0] != 0x49 or mid[1] != 0x54:
            raise OSError('TMAG5273 not found (manufacturer ID 0x%02X%02X)' % (mid[1], mid[0]))
        ver = self.i2c.readfrom_mem(addr, _DEVICE_ID, 1)[0] & 0x03
        if ver == 1:
            base = 40.0
        elif ver == 2:
            base = 133.0
        else:
            raise OSError('TMAG5273 unknown DEVICE_ID version %d' % ver)
        self.range_mt = base * (2 if wide_range else 1)
        # CRC off, no magnet tempco, CONV_AVG, standard 3-byte I2C read
        self._w(_DEVICE_CONFIG_1, (avg & 0x07) << 2)
        # MAG_CH_EN = 7h (X, Y, Z), SLEEPTIME unused
        self._w(_SENSOR_CONFIG_1, 0x70)
        # no angle calc; X_Y_RANGE and Z_RANGE
        r = 0x03 if wide_range else 0x00
        self._w(_SENSOR_CONFIG_2, r)
        # temperature channel on, no threshold
        self._w(_T_CONFIG, 0x01)
        # low-noise mode, glitch filter on, I2C trigger, continuous measure mode
        self._w(_DEVICE_CONFIG_2, 0x12)
        # tstart_measure 70 us + up to 4 channels x 32 samples (about 3.3 ms)
        time.sleep_ms(5)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes((val,)))

    def read(self):
        """Return (x, y, z) in mT and the chip temperature in degC."""
        for _ in range(50):
            if self.i2c.readfrom_mem(self.addr, _CONV_STATUS, 1)[0] & 0x01:
                break
            time.sleep_ms(1)
        else:
            raise OSError('TMAG5273: no conversion result')
        d = self.i2c.readfrom_mem(self.addr, _T_MSB_RESULT, 8)
        t_raw = _s16(d[0], d[1])
        k = 2 * self.range_mt / 65536
        x = _s16(d[2], d[3]) * k
        y = _s16(d[4], d[5]) * k
        z = _s16(d[6], d[7]) * k
        temp = _TSENS_T0 + (t_raw - _TADC_T0) / _TADC_RES
        return x, y, z, temp
