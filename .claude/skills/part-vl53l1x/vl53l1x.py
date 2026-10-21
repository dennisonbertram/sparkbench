# VL53L1X time-of-flight distance sensor (ST), MicroPython driver.
# Follows ST's Ultra Lite Driver (ULD, STSW-IMG009) register sequence: 16-bit register
# addresses, the 91-byte default configuration written to 0x2D..0x87, continuous ranging
# started with 0x40 in SYSTEM__MODE_START, data-ready polled on GPIO__TIO_HV_STATUS.
import time

_I2C_SLAVE_DEVICE_ADDRESS = 0x0001
_VHV_CONFIG_TIMEOUT_MACROP_LOOP_BOUND = 0x0008
_GPIO_HV_MUX_CTRL = 0x0030
_GPIO_TIO_HV_STATUS = 0x0031
_PHASECAL_CONFIG_TIMEOUT_MACROP = 0x004B
_RANGE_CONFIG_TIMEOUT_MACROP_A_HI = 0x005E
_RANGE_CONFIG_VCSEL_PERIOD_A = 0x0060
_RANGE_CONFIG_TIMEOUT_MACROP_B_HI = 0x0061
_RANGE_CONFIG_VCSEL_PERIOD_B = 0x0063
_RANGE_CONFIG_VALID_PHASE_HIGH = 0x0069
_SYSTEM_INTERMEASUREMENT_PERIOD = 0x006C
_SD_CONFIG_WOI_SD0 = 0x0078
_SD_CONFIG_INITIAL_PHASE_SD0 = 0x007A
_SYSTEM_INTERRUPT_CLEAR = 0x0086
_SYSTEM_MODE_START = 0x0087
_RESULT_RANGE_STATUS = 0x0089
_RESULT_RANGE_MM = 0x0096   # RESULT__FINAL_CROSSTALK_CORRECTED_RANGE_MM_SD0, 16-bit, mm
_RESULT_OSC_CALIBRATE_VAL = 0x00DE
_FIRMWARE_SYSTEM_STATUS = 0x00E5
_IDENTIFICATION_MODEL_ID = 0x010F  # 0xEA, then module type 0xCC at 0x0110

# ST ULD default configuration for registers 0x2D..0x87 (91 bytes).
_DEFAULT_CONFIG = bytes((
    0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x02, 0x08,  # 0x2D..0x34
    0x00, 0x08, 0x10, 0x01, 0x01, 0x00, 0x00, 0x00,  # 0x35..0x3C
    0x00, 0xFF, 0x00, 0x0F, 0x00, 0x00, 0x00, 0x00,  # 0x3D..0x44
    0x00, 0x20, 0x0B, 0x00, 0x00, 0x02, 0x0A, 0x21,  # 0x45..0x4C
    0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0xC8,  # 0x4D..0x54
    0x00, 0x00, 0x38, 0xFF, 0x01, 0x00, 0x08, 0x00,  # 0x55..0x5C
    0x00, 0x01, 0xCC, 0x0F, 0x01, 0xF1, 0x0D, 0x01,  # 0x5D..0x64
    0x68, 0x00, 0x80, 0x08, 0xB8, 0x00, 0x00, 0x00,  # 0x65..0x6C
    0x00, 0x0F, 0x89, 0x00, 0x00, 0x00, 0x00, 0x00,  # 0x6D..0x74
    0x00, 0x00, 0x01, 0x0F, 0x0D, 0x0E, 0x0E, 0x00,  # 0x75..0x7C
    0x00, 0x02, 0xC7, 0xFF, 0x9B, 0x00, 0x00, 0x00,  # 0x7D..0x84
    0x01, 0x00, 0x00,                                # 0x85..0x87
))

# Timing budget (ms) -> (RANGE_CONFIG__TIMEOUT_MACROP_A, _B) words, from the ST ULD.
_TB_SHORT = {15: (0x001D, 0x0027), 20: (0x0051, 0x006E), 33: (0x00D6, 0x006E),
             50: (0x01AE, 0x01E8), 100: (0x02E1, 0x0388), 200: (0x03E1, 0x0496),
             500: (0x0591, 0x05C1)}
_TB_LONG = {20: (0x001E, 0x0022), 33: (0x0060, 0x006E), 50: (0x00AD, 0x00C6),
            100: (0x01CC, 0x01EA), 200: (0x02D9, 0x02F8), 500: (0x048F, 0x04A4)}

# RESULT__RANGE_STATUS (low 5 bits) -> ULD range status (0 = valid).
_STATUS = {9: 0, 6: 1, 4: 2, 8: 3, 5: 4, 3: 5, 19: 6, 7: 7, 12: 9, 18: 10, 22: 11, 23: 12, 13: 13}


class VL53L1X:
    def __init__(self, i2c, address=0x29, io_2v8=True, timeout_ms=1000):
        """io_2v8=True suits breakouts whose SDA/SCL/GPIO1 are pulled up to the 2.8 V AVDD
        (Adafruit, Pololu, most clones). Use False only for a bare chip with 1.8 V I/O."""
        self.i2c = i2c
        self.addr = address
        self.timeout_ms = timeout_ms
        self.range_status = 255
        mid = self._rd(_IDENTIFICATION_MODEL_ID, 2)
        if mid[0] != 0xEA or mid[1] != 0xCC:
            raise OSError('VL53L1X not found (model id %02X%02X, expected EACC)' % (mid[0], mid[1]))
        self._wait(lambda: self._rd(_FIRMWARE_SYSTEM_STATUS, 1)[0] & 0x01, 'boot')
        cfg = bytearray(_DEFAULT_CONFIG)
        if io_2v8:
            cfg[0x2E - 0x2D] |= 0x01  # I2C pads pulled up at AVDD
            cfg[0x2F - 0x2D] |= 0x01  # GPIO pad pulled up at AVDD
        self._wr(0x2D, cfg)
        # ULD SensorInit: one ranging to settle VHV, then stop.
        self.start_ranging()
        self._wait(self.data_ready, 'first ranging')
        self.clear_interrupt()
        self.stop_ranging()
        self._wr(_VHV_CONFIG_TIMEOUT_MACROP_LOOP_BOUND, b'\x09')  # two bounds VHV
        self._wr(0x000B, b'\x00')  # start VHV from the previous temperature
        self.set_distance_mode(2)
        self.set_timing_budget(50)

    # ---- low level: 16-bit register addresses, big-endian data ----
    def _wr(self, reg, data):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF)) + bytes(data))

    def _rd(self, reg, n):
        self.i2c.writeto(self.addr, bytes(((reg >> 8) & 0xFF, reg & 0xFF)))
        return self.i2c.readfrom(self.addr, n)

    def _wr16(self, reg, v):
        self._wr(reg, bytes(((v >> 8) & 0xFF, v & 0xFF)))

    def _wait(self, cond, what):
        t0 = time.ticks_ms()
        while not cond():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('VL53L1X timeout waiting for ' + what)
            time.sleep_ms(2)

    # ---- ranging control ----
    def start_ranging(self):
        self._wr(_SYSTEM_INTERRUPT_CLEAR, b'\x01')
        self._wr(_SYSTEM_MODE_START, b'\x40')  # continuous (timed) ranging

    def stop_ranging(self):
        self._wr(_SYSTEM_MODE_START, b'\x00')

    def clear_interrupt(self):
        self._wr(_SYSTEM_INTERRUPT_CLEAR, b'\x01')

    def data_ready(self):
        # Interrupt polarity: GPIO_HV_MUX__CTRL bit 4 = 0 means active high.
        pol = 0 if self._rd(_GPIO_HV_MUX_CTRL, 1)[0] & 0x10 else 1
        return (self._rd(_GPIO_TIO_HV_STATUS, 1)[0] & 0x01) == pol

    # ---- settings ----
    def distance_mode(self):
        v = self._rd(_PHASECAL_CONFIG_TIMEOUT_MACROP, 1)[0]
        return 1 if v == 0x14 else 2 if v == 0x0A else None

    def set_distance_mode(self, mode):
        """1 = short (up to ~1.3 m, better in sunlight), 2 = long (up to 4 m in the dark)."""
        tb = getattr(self, '_tb', 50)
        if mode == 1:
            self._wr(_PHASECAL_CONFIG_TIMEOUT_MACROP, b'\x14')
            self._wr(_RANGE_CONFIG_VCSEL_PERIOD_A, b'\x07')
            self._wr(_RANGE_CONFIG_VCSEL_PERIOD_B, b'\x05')
            self._wr(_RANGE_CONFIG_VALID_PHASE_HIGH, b'\x38')
            self._wr(_SD_CONFIG_WOI_SD0, b'\x07\x05')
            self._wr(_SD_CONFIG_INITIAL_PHASE_SD0, b'\x06\x06')
        elif mode == 2:
            self._wr(_PHASECAL_CONFIG_TIMEOUT_MACROP, b'\x0A')
            self._wr(_RANGE_CONFIG_VCSEL_PERIOD_A, b'\x0F')
            self._wr(_RANGE_CONFIG_VCSEL_PERIOD_B, b'\x0D')
            self._wr(_RANGE_CONFIG_VALID_PHASE_HIGH, b'\xB8')
            self._wr(_SD_CONFIG_WOI_SD0, b'\x0F\x0D')
            self._wr(_SD_CONFIG_INITIAL_PHASE_SD0, b'\x0E\x0E')
        else:
            raise ValueError('distance mode must be 1 (short) or 2 (long)')
        self.set_timing_budget(tb if tb in (_TB_SHORT if mode == 1 else _TB_LONG) else 50)

    def set_timing_budget(self, ms):
        """15 (short only), 20, 33, 50, 100, 200 or 500 ms."""
        table = _TB_SHORT if self.distance_mode() == 1 else _TB_LONG
        if ms not in table:
            raise ValueError('unsupported timing budget for this distance mode')
        a, b = table[ms]
        self._wr16(_RANGE_CONFIG_TIMEOUT_MACROP_A_HI, a)
        self._wr16(_RANGE_CONFIG_TIMEOUT_MACROP_B_HI, b)
        self._tb = ms

    def set_inter_measurement_ms(self, ms):
        """Period between ranges in continuous mode; must be >= the timing budget."""
        d = self._rd(_RESULT_OSC_CALIBRATE_VAL, 2)
        pll = ((d[0] << 8) | d[1]) & 0x3FF
        v = int(pll * ms * 1.075)
        self._wr(_SYSTEM_INTERMEASUREMENT_PERIOD, bytes(((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)))

    def set_address(self, new_addr):
        self._wr(_I2C_SLAVE_DEVICE_ADDRESS, bytes((new_addr & 0x7F,)))
        self.addr = new_addr

    # ---- measurement ----
    def read(self):
        """Wait for the next range. Returns the distance in mm, or None if the range status
        is not valid (no target, signal too weak, out of range). Call start_ranging() first."""
        self._wait(self.data_ready, 'data')
        self.range_status = _STATUS.get(self._rd(_RESULT_RANGE_STATUS, 1)[0] & 0x1F, 255)
        d = self._rd(_RESULT_RANGE_MM, 2)
        self.clear_interrupt()
        mm = (d[0] << 8) | d[1]
        return mm if self.range_status == 0 else None
