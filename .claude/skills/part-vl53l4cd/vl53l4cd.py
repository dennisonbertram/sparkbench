# VL53L4CD time-of-flight distance sensor (ST), MicroPython driver.
# Follows ST's Ultra Lite Driver (ULD, STSW-IMG026, as published in stm32duino/VL53L4CD):
# 16-bit register addresses, wait for FIRMWARE__SYSTEM_STATUS = 3, load the 91-byte default
# configuration to 0x2D..0x87, one VHV ranging, then ranging started through SYSTEM_START
# (0x21 = continuous back-to-back, 0x40 = autonomous with an inter-measurement period).
import time

_I2C_SLAVE_DEVICE_ADDRESS = 0x0001
_OSC_FREQUENCY = 0x0006                      # 16-bit, read by SetRangeTiming
_VHV_CONFIG_TIMEOUT_MACROP_LOOP_BOUND = 0x0008
_RANGE_OFFSET_MM = 0x001E
_INNER_OFFSET_MM = 0x0020
_OUTER_OFFSET_MM = 0x0022
_GPIO_HV_MUX_CTRL = 0x0030
_GPIO_TIO_HV_STATUS = 0x0031
_RANGE_CONFIG_A = 0x005E
_RANGE_CONFIG_B = 0x0061
_INTERMEASUREMENT_MS = 0x006C                # 32-bit
_SYSTEM_INTERRUPT_CLEAR = 0x0086
_SYSTEM_START = 0x0087
_RESULT_RANGE_STATUS = 0x0089
_RESULT_SPAD_NB = 0x008C                     # 16-bit, number of SPADs x 256
_RESULT_SIGNAL_RATE = 0x008E                 # 16-bit, kcps / 8
_RESULT_AMBIENT_RATE = 0x0090                # 16-bit, kcps / 8
_RESULT_SIGMA = 0x0092                       # 16-bit, mm x 4
_RESULT_DISTANCE = 0x0096                    # 16-bit, mm
_RESULT_OSC_CALIBRATE_VAL = 0x00DE
_FIRMWARE_SYSTEM_STATUS = 0x00E5
_IDENTIFICATION_MODEL_ID = 0x010F            # 0xEB, then module type 0xAA at 0x0110

# ST ULD default configuration for registers 0x2D..0x87 (91 bytes).
_DEFAULT_CONFIG = bytes((
    0x12, 0x00, 0x00, 0x11, 0x02, 0x00, 0x02, 0x08,  # 0x2D..0x34
    0x00, 0x08, 0x10, 0x01, 0x01, 0x00, 0x00, 0x00,  # 0x35..0x3C
    0x00, 0xFF, 0x00, 0x0F, 0x00, 0x00, 0x00, 0x00,  # 0x3D..0x44
    0x00, 0x20, 0x0B, 0x00, 0x00, 0x02, 0x14, 0x21,  # 0x45..0x4C
    0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0xC8,  # 0x4D..0x54
    0x00, 0x00, 0x38, 0xFF, 0x01, 0x00, 0x08, 0x00,  # 0x55..0x5C
    0x00, 0x01, 0xCC, 0x07, 0x01, 0xF1, 0x05, 0x00,  # 0x5D..0x64
    0xA0, 0x00, 0x80, 0x08, 0x38, 0x00, 0x00, 0x00,  # 0x65..0x6C
    0x00, 0x0F, 0x89, 0x00, 0x00, 0x00, 0x00, 0x00,  # 0x6D..0x74
    0x00, 0x00, 0x01, 0x07, 0x05, 0x06, 0x06, 0x00,  # 0x75..0x7C
    0x00, 0x02, 0xC7, 0xFF, 0x9B, 0x00, 0x00, 0x00,  # 0x7D..0x84
    0x01, 0x00, 0x00,                                # 0x85..0x87
))

# RESULT__RANGE_STATUS (low 5 bits) -> ULD range status (0 = valid), from VL53L4CD_GetResult.
_STATUS = (255, 255, 255, 5, 2, 4, 1, 7, 3, 0, 255, 255, 9, 13, 255, 255,
           255, 255, 10, 6, 255, 255, 11, 12)

_M32 = 0xFFFFFFFF


class VL53L4CD:
    def __init__(self, i2c, address=0x29, io_2v8=True, timeout_ms=1000):
        """io_2v8=True when SDA/SCL/GPIO1 are pulled up to the 2.8 V AVDD (Adafruit 5396,
        Pololu, SATEL boards). Use False only for a bare chip on a 1.8 V I/O bus."""
        self.i2c = i2c
        self.addr = address
        self.timeout_ms = timeout_ms
        self.range_status = 255
        self.sigma_mm = 0
        self.signal_kcps = 0
        mid = self._rd(_IDENTIFICATION_MODEL_ID, 2)
        if mid[0] != 0xEB or mid[1] != 0xAA:
            raise OSError('VL53L4CD not found (model id %02X%02X, expected EBAA)' % (mid[0], mid[1]))
        # ULD SensorInit
        self._wait(lambda: self._rd(_FIRMWARE_SYSTEM_STATUS, 1)[0] == 0x03, 'boot')
        cfg = bytearray(_DEFAULT_CONFIG)
        if io_2v8:
            cfg[0x2E - 0x2D] |= 0x01  # I2C pads pulled up at AVDD
            cfg[0x2F - 0x2D] |= 0x01  # GPIO pad pulled up at AVDD
        self._wr(0x2D, cfg)
        self._wr(_SYSTEM_START, b'\x40')          # start VHV
        self._wait(self.data_ready, 'VHV')
        self.clear_interrupt()
        self.stop_ranging()
        self._wr(_VHV_CONFIG_TIMEOUT_MACROP_LOOP_BOUND, b'\x09')
        self._wr(0x000B, b'\x00')
        self._wr16(0x0024, 0x0500)
        self.set_range_timing(50, 0)

    # ---- low level: 16-bit register addresses, big-endian data ----
    def _wr(self, reg, data):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF)) + bytes(data))

    def _rd(self, reg, n):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF)))
        return self.i2c.readfrom(self.addr, n)

    def _wr16(self, reg, v):
        self._wr(reg, bytes(((v >> 8) & 0xFF, v & 0xFF)))

    def _wr32(self, reg, v):
        self._wr(reg, bytes(((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)))

    def _rd16(self, reg):
        d = self._rd(reg, 2)
        return (d[0] << 8) | d[1]

    def _rd32(self, reg):
        d = self._rd(reg, 4)
        return (d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]

    def _wait(self, cond, what):
        t0 = time.ticks_ms()
        while not cond():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('VL53L4CD timeout waiting for ' + what)
            time.sleep_ms(1)

    # ---- ranging control ----
    def data_ready(self):
        # GPIO_HV_MUX_CTRL bit 4 = 1 means the interrupt is active low (the default config).
        pol = 0 if self._rd(_GPIO_HV_MUX_CTRL, 1)[0] & 0x10 else 1
        return (self._rd(_GPIO_TIO_HV_STATUS, 1)[0] & 0x01) == pol

    def clear_interrupt(self):
        self._wr(_SYSTEM_INTERRUPT_CLEAR, b'\x01')

    def start_ranging(self):
        if self._rd32(_INTERMEASUREMENT_MS) == 0:
            self._wr(_SYSTEM_START, b'\x21')      # continuous, back-to-back
        else:
            self._wr(_SYSTEM_START, b'\x40')      # autonomous, timed
        self._wait(self.data_ready, 'first range')
        self.clear_interrupt()

    def stop_ranging(self):
        self._wr(_SYSTEM_START, b'\x00')

    # ---- settings ----
    def set_range_timing(self, timing_budget_ms, inter_measurement_ms=0):
        """Timing budget 10..200 ms. inter_measurement_ms = 0 ranges back to back (continuous);
        otherwise it must be larger than the timing budget (autonomous low-power mode)."""
        osc = self._rd16(_OSC_FREQUENCY)
        if osc == 0:
            raise OSError('VL53L4CD oscillator frequency reads 0')
        if not 10 <= timing_budget_ms <= 200:
            raise ValueError('timing budget must be 10..200 ms')
        macro_period_us = ((2304 * (0x40000000 // osc)) & _M32) >> 6
        tb_us = timing_budget_ms * 1000
        if inter_measurement_ms == 0:
            self._wr32(_INTERMEASUREMENT_MS, 0)
            tb_us -= 2500
        elif inter_measurement_ms > timing_budget_ms:
            clock_pll = self._rd16(_RESULT_OSC_CALIBRATE_VAL) & 0x3FF
            self._wr32(_INTERMEASUREMENT_MS, int(1.055 * inter_measurement_ms * clock_pll) & _M32)
            tb_us -= 4300
            tb_us //= 2
        else:
            raise ValueError('inter-measurement period must be 0 or longer than the timing budget')
        tb_us = (tb_us << 12) & _M32
        for reg, mult in ((_RANGE_CONFIG_A, 16), (_RANGE_CONFIG_B, 12)):
            t = ((macro_period_us * mult) & _M32) >> 6
            ls = (tb_us + (t >> 1)) // t - 1
            ms = 0
            while ls & 0xFFFFFF00:
                ls >>= 1
                ms += 1
            self._wr16(reg, (ms << 8) + (ls & 0xFF))
        self._tb = timing_budget_ms

    def set_offset(self, offset_mm):
        """Offset correction in mm (from ST's offset calibration flow)."""
        self._wr16(_RANGE_OFFSET_MM, (offset_mm * 4) & 0xFFFF)
        self._wr16(_INNER_OFFSET_MM, 0)
        self._wr16(_OUTER_OFFSET_MM, 0)

    def set_address(self, new_addr):
        """new_addr is the 7-bit address (the ULD takes the 8-bit form and shifts it)."""
        self._wr(_I2C_SLAVE_DEVICE_ADDRESS, bytes((new_addr & 0x7F,)))
        self.addr = new_addr

    # ---- measurement ----
    def read(self):
        """Wait for the next range. Returns the distance in mm, or None if the range status
        is not valid (no target, signal too weak, out of range). Call start_ranging() first."""
        self._wait(self.data_ready, 'data')
        raw = self._rd(_RESULT_RANGE_STATUS, 1)[0] & 0x1F
        st = _STATUS[raw] if raw < 24 else raw
        spads = self._rd16(_RESULT_SPAD_NB) // 256
        if spads == 0:
            st = 255
            mm = 0
        else:
            self.signal_kcps = self._rd16(_RESULT_SIGNAL_RATE) * 8
            self.sigma_mm = self._rd16(_RESULT_SIGMA) // 4
            mm = self._rd16(_RESULT_DISTANCE)
        self.clear_interrupt()
        self.range_status = st
        return mm if st == 0 else None
