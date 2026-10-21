# SI1145 UV index / visible / IR light sensor (Silicon Labs Si1145/46/47), MicroPython driver.
# Written from the Si1145/46/47 datasheet rev 1.1: forced (one-shot) ALS measurements.
# Readings: visible and IR in raw ADC counts (the datasheet's unit, default gain),
# UV index = AUX_DATA / 100.
import time

_PART_ID = 0x00
_HW_KEY = 0x07
_MEAS_RATE0 = 0x08
_MEAS_RATE1 = 0x09
_UCOEF0 = 0x13
_PARAM_WR = 0x17
_COMMAND = 0x18
_RESPONSE = 0x20
_ALS_VIS_DATA0 = 0x22
_ALS_IR_DATA0 = 0x24
_AUX_DATA0 = 0x2C

_CMD_NOP = 0x00
_CMD_RESET = 0x01
_CMD_ALS_FORCE = 0x06
_CMD_PARAM_SET = 0xA0  # 101a aaaa: parameter offset in the low 5 bits

_PARAM_CHLIST = 0x01
_CHLIST_EN_UV = 0x80
_CHLIST_EN_ALS_IR = 0x20
_CHLIST_EN_ALS_VIS = 0x10


class SI1145:
    def __init__(self, i2c, addr=0x60):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(25)  # start-up time after power-up (datasheet Table 1)
        pid = self._read8(_PART_ID)
        if pid != 0x45:
            raise OSError('SI1145 not found (PART_ID 0x%02x): check the wiring' % pid)
        # Forced-measurement mode (MEAS_RATE = 0), then software reset.
        self._write8(_MEAS_RATE0, 0)
        self._write8(_MEAS_RATE1, 0)
        self._command(_CMD_RESET)
        time.sleep_ms(10)
        self._write8(_HW_KEY, 0x17)  # required for proper operation
        # UV index coefficients: datasheet defaults for an uncovered sensor.
        for i, c in enumerate((0x29, 0x89, 0x02, 0x00)):
            self._write8(_UCOEF0 + i, c)
        # Measure UV index, visible and IR on every ALS_FORCE.
        self._set_param(_PARAM_CHLIST, _CHLIST_EN_UV | _CHLIST_EN_ALS_IR | _CHLIST_EN_ALS_VIS)

    def _write8(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val & 0xFF]))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.addr, reg, 1)[0]

    def _read16(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 2)
        return d[0] | (d[1] << 8)  # DATA0 = low byte, DATA1 = high byte

    def _command(self, cmd):
        self._write8(_COMMAND, cmd)
        time.sleep_ms(2)

    def _set_param(self, param, value):
        self._write8(_PARAM_WR, value)
        self._command(_CMD_PARAM_SET | (param & 0x1F))

    def read(self):
        """Measure once; return (UV index, visible counts, IR counts)."""
        if self._read8(_RESPONSE) & 0x80:
            self._command(_CMD_NOP)  # clear a previous error/overflow code
        self._command(_CMD_ALS_FORCE)
        time.sleep_ms(10)  # VIS + IR + UV conversions take well under 1 ms at default settings
        # On ADC overflow (too bright for the default range) the data register reads 0xFFFF.
        vis = self._read16(_ALS_VIS_DATA0)
        ir = self._read16(_ALS_IR_DATA0)
        uv = self._read16(_AUX_DATA0) / 100
        return uv, vis, ir

    def uv_index(self):
        return self.read()[0]

    def visible(self):
        return self.read()[1]

    def ir(self):
        return self.read()[2]
