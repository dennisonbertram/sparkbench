# VL53L0X time-of-flight distance sensor (ST), MicroPython driver.
# A port of Pololu's vl53l0x-arduino library, which reproduces the init, SPAD, tuning,
# timing-budget and reference-calibration sequence of ST's VL53L0X API (STSW-IMG005).
# ST's datasheet has no register map; register names below are the API's.
import time

_SYSRANGE_START = 0x00
_SYSTEM_SEQUENCE_CONFIG = 0x01
_SYSTEM_INTERMEASUREMENT_PERIOD = 0x04
_SYSTEM_INTERRUPT_CONFIG_GPIO = 0x0A
_SYSTEM_INTERRUPT_CLEAR = 0x0B
_RESULT_INTERRUPT_STATUS = 0x13
_RESULT_RANGE_STATUS = 0x14     # range in mm is the 16-bit word at RESULT_RANGE_STATUS + 10
_GLOBAL_CONFIG_VCSEL_WIDTH = 0x32
_FINAL_RANGE_CONFIG_MIN_COUNT_RATE_RTN_LIMIT = 0x44
_MSRC_CONFIG_TIMEOUT_MACROP = 0x46
_FINAL_RANGE_CONFIG_VALID_PHASE_LOW = 0x47
_FINAL_RANGE_CONFIG_VALID_PHASE_HIGH = 0x48
_DYNAMIC_SPAD_NUM_REQUESTED_REF_SPAD = 0x4E
_DYNAMIC_SPAD_REF_EN_START_OFFSET = 0x4F
_PRE_RANGE_CONFIG_VCSEL_PERIOD = 0x50
_PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI = 0x51
_PRE_RANGE_CONFIG_VALID_PHASE_LOW = 0x56
_PRE_RANGE_CONFIG_VALID_PHASE_HIGH = 0x57
_MSRC_CONFIG_CONTROL = 0x60
_FINAL_RANGE_CONFIG_VCSEL_PERIOD = 0x70
_FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI = 0x71
_GPIO_HV_MUX_ACTIVE_HIGH = 0x84
_VHV_CONFIG_PAD_SCL_SDA__EXTSUP_HV = 0x89
_I2C_SLAVE_DEVICE_ADDRESS = 0x8A
_GLOBAL_CONFIG_SPAD_ENABLES_REF_0 = 0xB0
_GLOBAL_CONFIG_REF_EN_START_SELECT = 0xB6
_IDENTIFICATION_MODEL_ID = 0xC0   # reads 0xEE (datasheet table 4)
_OSC_CALIBRATE_VAL = 0xF8
_ALGO_PHASECAL_LIM = 0x30
_ALGO_PHASECAL_CONFIG_TIMEOUT = 0x30

# ST API default tuning settings (register, value); 0xFF selects the register page.
_TUNING = (
    (0xFF, 0x01), (0x00, 0x00), (0xFF, 0x00), (0x09, 0x00), (0x10, 0x00), (0x11, 0x00),
    (0x24, 0x01), (0x25, 0xFF), (0x75, 0x00), (0xFF, 0x01), (0x4E, 0x2C), (0x48, 0x00),
    (0x30, 0x20), (0xFF, 0x00), (0x30, 0x09), (0x54, 0x00), (0x31, 0x04), (0x32, 0x03),
    (0x40, 0x83), (0x46, 0x25), (0x60, 0x00), (0x27, 0x00), (0x50, 0x06), (0x51, 0x00),
    (0x52, 0x96), (0x56, 0x08), (0x57, 0x30), (0x61, 0x00), (0x62, 0x00), (0x64, 0x00),
    (0x65, 0x00), (0x66, 0xA0), (0xFF, 0x01), (0x22, 0x32), (0x47, 0x14), (0x49, 0xFF),
    (0x4A, 0x00), (0xFF, 0x00), (0x7A, 0x0A), (0x7B, 0x00), (0x78, 0x21), (0xFF, 0x01),
    (0x23, 0x34), (0x42, 0x00), (0x44, 0xFF), (0x45, 0x26), (0x46, 0x05), (0x40, 0x40),
    (0x0E, 0x06), (0x20, 0x1A), (0x43, 0x40), (0xFF, 0x00), (0x34, 0x03), (0x35, 0x44),
    (0xFF, 0x01), (0x31, 0x04), (0x4B, 0x09), (0x4C, 0x05), (0x4D, 0x04), (0xFF, 0x00),
    (0x44, 0x00), (0x45, 0x20), (0x47, 0x08), (0x48, 0x28), (0x67, 0x00), (0x70, 0x04),
    (0x71, 0x01), (0x72, 0xFE), (0x76, 0x00), (0x77, 0x00), (0xFF, 0x01), (0x0D, 0x01),
    (0xFF, 0x00), (0x80, 0x01), (0x01, 0xF8), (0xFF, 0x01), (0x8E, 0x01), (0x00, 0x01),
    (0xFF, 0x00), (0x80, 0x00),
)


def _decode_vcsel(v):
    return (v + 1) << 1


def _macro_period_ns(vcsel_pclks):
    return (2304 * vcsel_pclks * 1655 + 500) // 1000


def _decode_timeout(v):
    return ((v & 0xFF) << ((v >> 8) & 0xFF)) + 1


def _encode_timeout(mclks):
    if mclks <= 0:
        return 0
    ls = mclks - 1
    ms = 0
    while ls & 0xFFFFFF00:
        ls >>= 1
        ms += 1
    return (ms << 8) | (ls & 0xFF)


def _mclks_to_us(mclks, vcsel_pclks):
    m = _macro_period_ns(vcsel_pclks)
    return (mclks * m + 500) // 1000


def _us_to_mclks(us, vcsel_pclks):
    m = _macro_period_ns(vcsel_pclks)
    return (us * 1000 + m // 2) // m


class VL53L0X:
    def __init__(self, i2c, address=0x29, io_2v8=True, timeout_ms=500):
        """io_2v8=True suits modules whose SDA/SCL are pulled up to the 2.8 V supply
        (GY-530, Pololu, Adafruit). Use False only with 1.8 V I/O on a bare chip."""
        self.i2c = i2c
        self.addr = address
        self.timeout_ms = timeout_ms
        self.range_status = 0
        self._buf1 = bytearray(1)
        if self._r8(_IDENTIFICATION_MODEL_ID) != 0xEE:
            raise OSError('VL53L0X not found (model id 0x%02X, expected 0xEE)' % self._r8(_IDENTIFICATION_MODEL_ID))
        if io_2v8:
            self._w8(_VHV_CONFIG_PAD_SCL_SDA__EXTSUP_HV, self._r8(_VHV_CONFIG_PAD_SCL_SDA__EXTSUP_HV) | 0x01)
        # Set I2C standard mode and read the stop variable.
        self._w8(0x88, 0x00)
        self._w8(0x80, 0x01)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x00)
        self._stop = self._r8(0x91)
        self._w8(0x00, 0x01)
        self._w8(0xFF, 0x00)
        self._w8(0x80, 0x00)
        # Disable SIGNAL_RATE_MSRC and SIGNAL_RATE_PRE_RANGE limit checks.
        self._w8(_MSRC_CONFIG_CONTROL, self._r8(_MSRC_CONFIG_CONTROL) | 0x12)
        self.set_signal_rate_limit(0.25)
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0xFF)
        # Reference SPADs from the factory NVM.
        count, aperture = self._spad_info()
        spads = bytearray(self._rd(_GLOBAL_CONFIG_SPAD_ENABLES_REF_0, 6))
        self._w8(0xFF, 0x01)
        self._w8(_DYNAMIC_SPAD_REF_EN_START_OFFSET, 0x00)
        self._w8(_DYNAMIC_SPAD_NUM_REQUESTED_REF_SPAD, 0x2C)
        self._w8(0xFF, 0x00)
        self._w8(_GLOBAL_CONFIG_REF_EN_START_SELECT, 0xB4)
        first = 12 if aperture else 0
        enabled = 0
        for i in range(48):
            if i < first or enabled == count:
                spads[i // 8] &= ~(1 << (i % 8)) & 0xFF
            elif (spads[i // 8] >> (i % 8)) & 1:
                enabled += 1
        self._wr(_GLOBAL_CONFIG_SPAD_ENABLES_REF_0, spads)
        for reg, val in _TUNING:
            self._w8(reg, val)
        # New-sample-ready interrupt on GPIO1, active low.
        self._w8(_SYSTEM_INTERRUPT_CONFIG_GPIO, 0x04)
        self._w8(_GPIO_HV_MUX_ACTIVE_HIGH, self._r8(_GPIO_HV_MUX_ACTIVE_HIGH) & ~0x10 & 0xFF)
        self._w8(_SYSTEM_INTERRUPT_CLEAR, 0x01)
        self._budget_us = self.timing_budget_us()
        # Disable MSRC and TCC by default, then recompute the timing budget.
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0xE8)
        self.set_timing_budget_us(self._budget_us)
        # VHV and phase reference calibrations.
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0x01)
        self._ref_calibration(0x40)
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0x02)
        self._ref_calibration(0x00)
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0xE8)

    # ---- low level: 8-bit register index, multi-byte values MSB first ----
    def _w8(self, reg, v):
        self.i2c.writeto(self.addr, bytes((reg, v & 0xFF)))

    def _w16(self, reg, v):
        self.i2c.writeto(self.addr, bytes((reg, (v >> 8) & 0xFF, v & 0xFF)))

    def _w32(self, reg, v):
        self.i2c.writeto(self.addr, bytes((reg, (v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)))

    def _wr(self, reg, data):
        self.i2c.writeto(self.addr, bytes((reg,)) + bytes(data))

    def _rd(self, reg, n):
        self.i2c.writeto(self.addr, bytes((reg,)))
        return self.i2c.readfrom(self.addr, n)

    def _r8(self, reg):
        return self._rd(reg, 1)[0]

    def _r16(self, reg):
        d = self._rd(reg, 2)
        return (d[0] << 8) | d[1]

    def _wait(self, cond, what):
        t0 = time.ticks_ms()
        while not cond():
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError('VL53L0X timeout waiting for ' + what)
            time.sleep_ms(1)

    def _spad_info(self):
        self._w8(0x80, 0x01)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x00)
        self._w8(0xFF, 0x06)
        self._w8(0x83, self._r8(0x83) | 0x04)
        self._w8(0xFF, 0x07)
        self._w8(0x81, 0x01)
        self._w8(0x80, 0x01)
        self._w8(0x94, 0x6B)
        self._w8(0x83, 0x00)
        self._wait(lambda: self._r8(0x83) != 0x00, 'SPAD info')
        self._w8(0x83, 0x01)
        tmp = self._r8(0x92)
        self._w8(0x81, 0x00)
        self._w8(0xFF, 0x06)
        self._w8(0x83, self._r8(0x83) & ~0x04 & 0xFF)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x01)
        self._w8(0xFF, 0x00)
        self._w8(0x80, 0x00)
        return tmp & 0x7F, (tmp >> 7) & 0x01

    def _ref_calibration(self, vhv_init_byte):
        self._w8(_SYSRANGE_START, 0x01 | vhv_init_byte)
        self._wait(lambda: self._r8(_RESULT_INTERRUPT_STATUS) & 0x07, 'reference calibration')
        self._w8(_SYSTEM_INTERRUPT_CLEAR, 0x01)
        self._w8(_SYSRANGE_START, 0x00)

    # ---- settings ----
    def set_signal_rate_limit(self, mcps):
        """Minimum return signal rate in MCPS (default 0.25); lower reaches further but
        accepts less reliable readings. Stored as 9.7 fixed point."""
        if not 0 <= mcps <= 511.99:
            raise ValueError('signal rate limit must be 0-511.99 MCPS')
        self._w16(_FINAL_RANGE_CONFIG_MIN_COUNT_RATE_RTN_LIMIT, int(mcps * 128))

    def _steps(self):
        c = self._r8(_SYSTEM_SEQUENCE_CONFIG)
        return {'tcc': (c >> 4) & 1, 'dss': (c >> 3) & 1, 'msrc': (c >> 2) & 1,
                'pre': (c >> 6) & 1, 'final': (c >> 7) & 1}

    def _timeouts(self, en):
        t = {}
        t['pre_vcsel'] = _decode_vcsel(self._r8(_PRE_RANGE_CONFIG_VCSEL_PERIOD))
        t['msrc_mclks'] = self._r8(_MSRC_CONFIG_TIMEOUT_MACROP) + 1
        t['msrc_us'] = _mclks_to_us(t['msrc_mclks'], t['pre_vcsel'])
        t['pre_mclks'] = _decode_timeout(self._r16(_PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI))
        t['pre_us'] = _mclks_to_us(t['pre_mclks'], t['pre_vcsel'])
        t['final_vcsel'] = _decode_vcsel(self._r8(_FINAL_RANGE_CONFIG_VCSEL_PERIOD))
        t['final_mclks'] = _decode_timeout(self._r16(_FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI))
        if en['pre']:
            t['final_mclks'] -= t['pre_mclks']
        t['final_us'] = _mclks_to_us(t['final_mclks'], t['final_vcsel'])
        return t

    def _used_budget(self, en, t):
        used = 1910 + 960  # start + end overhead
        if en['tcc']:
            used += t['msrc_us'] + 590
        if en['dss']:
            used += 2 * (t['msrc_us'] + 690)
        elif en['msrc']:
            used += t['msrc_us'] + 660
        if en['pre']:
            used += t['pre_us'] + 660
        return used

    def timing_budget_us(self):
        en = self._steps()
        t = self._timeouts(en)
        b = self._used_budget(en, t)
        if en['final']:
            b += t['final_us'] + 550
        return b

    def set_timing_budget_us(self, budget_us):
        """Time allowed for one range (default about 33000 us; 20000 us minimum).
        Longer budgets give more accurate readings: 200000 us for high accuracy."""
        en = self._steps()
        t = self._timeouts(en)
        used = self._used_budget(en, t)
        if en['final']:
            used += 550
            if used > budget_us:
                raise ValueError('timing budget too short')
            mclks = _us_to_mclks(budget_us - used, t['final_vcsel'])
            if en['pre']:
                mclks += t['pre_mclks']
            self._w16(_FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI, _encode_timeout(mclks))
            self._budget_us = budget_us

    def set_vcsel_pulse_period(self, final, pclks):
        """Laser pulse period in PCLKs: pre-range (final=False) 12/14/16/18, final range
        (final=True) 8/10/12/14. Longer periods (18 and 14) extend the range."""
        reg = (pclks >> 1) - 1
        en = self._steps()
        t = self._timeouts(en)
        if not final:
            phase = {12: 0x18, 14: 0x30, 16: 0x40, 18: 0x50}
            if pclks not in phase:
                raise ValueError('pre-range period must be 12, 14, 16 or 18')
            self._w8(_PRE_RANGE_CONFIG_VALID_PHASE_HIGH, phase[pclks])
            self._w8(_PRE_RANGE_CONFIG_VALID_PHASE_LOW, 0x08)
            self._w8(_PRE_RANGE_CONFIG_VCSEL_PERIOD, reg)
            self._w16(_PRE_RANGE_CONFIG_TIMEOUT_MACROP_HI, _encode_timeout(_us_to_mclks(t['pre_us'], pclks)))
            m = _us_to_mclks(t['msrc_us'], pclks)
            self._w8(_MSRC_CONFIG_TIMEOUT_MACROP, 255 if m > 256 else m - 1)
        else:
            cfg = {8: (0x10, 0x02, 0x0C, 0x30), 10: (0x28, 0x03, 0x09, 0x20),
                   12: (0x38, 0x03, 0x08, 0x20), 14: (0x48, 0x03, 0x07, 0x20)}
            if pclks not in cfg:
                raise ValueError('final-range period must be 8, 10, 12 or 14')
            hi, width, tmo, lim = cfg[pclks]
            self._w8(_FINAL_RANGE_CONFIG_VALID_PHASE_HIGH, hi)
            self._w8(_FINAL_RANGE_CONFIG_VALID_PHASE_LOW, 0x08)
            self._w8(_GLOBAL_CONFIG_VCSEL_WIDTH, width)
            self._w8(_ALGO_PHASECAL_CONFIG_TIMEOUT, tmo)
            self._w8(0xFF, 0x01)
            self._w8(_ALGO_PHASECAL_LIM, lim)
            self._w8(0xFF, 0x00)
            self._w8(_FINAL_RANGE_CONFIG_VCSEL_PERIOD, reg)
            m = _us_to_mclks(t['final_us'], pclks)
            if en['pre']:
                m += t['pre_mclks']
            self._w16(_FINAL_RANGE_CONFIG_TIMEOUT_MACROP_HI, _encode_timeout(m))
        self.set_timing_budget_us(self._budget_us)
        seq = self._r8(_SYSTEM_SEQUENCE_CONFIG)
        self._w8(_SYSTEM_SEQUENCE_CONFIG, 0x02)
        self._ref_calibration(0x00)
        self._w8(_SYSTEM_SEQUENCE_CONFIG, seq)

    def long_range(self):
        """ST's long-range profile: up to about 2 m in the dark, noisier readings."""
        self.set_signal_rate_limit(0.1)
        self.set_vcsel_pulse_period(False, 18)
        self.set_vcsel_pulse_period(True, 14)

    def set_address(self, new_addr):
        self._w8(_I2C_SLAVE_DEVICE_ADDRESS, new_addr & 0x7F)
        self.addr = new_addr

    # ---- ranging ----
    def _load_stop(self):
        self._w8(0x80, 0x01)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x00)
        self._w8(0x91, self._stop)
        self._w8(0x00, 0x01)
        self._w8(0xFF, 0x00)
        self._w8(0x80, 0x00)

    def start_continuous(self, period_ms=0):
        """Range continuously: back-to-back (period_ms=0) or once every period_ms."""
        self._load_stop()
        if period_ms:
            osc = self._r16(_OSC_CALIBRATE_VAL)
            if osc:
                period_ms *= osc
            self._w32(_SYSTEM_INTERMEASUREMENT_PERIOD, period_ms)
            self._w8(_SYSRANGE_START, 0x04)  # timed
        else:
            self._w8(_SYSRANGE_START, 0x02)  # back-to-back

    def stop_continuous(self):
        self._w8(_SYSRANGE_START, 0x01)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x00)
        self._w8(0x91, 0x00)
        self._w8(0x00, 0x01)
        self._w8(0xFF, 0x00)

    def read(self):
        """Next range in continuous mode, in mm, or None when nothing is in range
        (the chip reports 8190/8191 mm then)."""
        self._wait(lambda: self._r8(_RESULT_INTERRUPT_STATUS) & 0x07, 'range')
        d = self._rd(_RESULT_RANGE_STATUS, 12)
        self._w8(_SYSTEM_INTERRUPT_CLEAR, 0x01)
        self.range_status = (d[0] & 0x78) >> 3  # 11 = range valid (ST API)
        mm = (d[10] << 8) | d[11]
        return None if mm >= 8190 else mm

    def read_single(self):
        """Start one range, wait for it and return mm (or None if out of range)."""
        self._load_stop()
        self._w8(_SYSRANGE_START, 0x01)
        self._wait(lambda: not (self._r8(_SYSRANGE_START) & 0x01), 'range start')
        return self.read()
