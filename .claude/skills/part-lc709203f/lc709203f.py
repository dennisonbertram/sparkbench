# LC709203F LiPo/Li-ion fuel gauge (onsemi), MicroPython driver.
# SMBus word protocol from the datasheet: every word is low byte first and is followed by a CRC-8-ATM
# (poly 0x07, init 0x00). Reads: CRC over 0x16, command, 0x17, low, high. Writes: CRC over 0x16,
# command, low, high; the chip ignores a write without a correct CRC.
import time

ADDR = 0x0B

REG_BEFORE_RSOC = 0x04
REG_THERMISTOR_B = 0x06
REG_INITIAL_RSOC = 0x07
REG_CELL_TEMPERATURE = 0x08
REG_CELL_VOLTAGE = 0x09
REG_CURRENT_DIRECTION = 0x0A
REG_APA = 0x0B
REG_APT = 0x0C
REG_RSOC = 0x0D
REG_ITE = 0x0F
REG_IC_VERSION = 0x11
REG_CHANGE_PARAMETER = 0x12
REG_ALARM_LOW_RSOC = 0x13
REG_ALARM_LOW_VOLTAGE = 0x14
REG_IC_POWER_MODE = 0x15
REG_STATUS_BIT = 0x16
REG_NUMBER_OF_PARAMETER = 0x1A

POWER_OPERATIONAL = 0x0001
POWER_SLEEP = 0x0002

# Typical APA (0x0B) for battery type 01/03 (3.7 V / 4.2 V or 3.8 V / 4.35 V cells), datasheet Table 7.
APA = {100: 0x08, 200: 0x0B, 500: 0x10, 1000: 0x19, 2000: 0x2D, 3000: 0x36}


def crc8(data):
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


class LC709203F:
    def __init__(self, i2c, addr=ADDR, capacity_mah=500, profile=1, init=True):
        """profile 1 = 3.7 V nominal / 4.2 V charge cells (most hobby LiPos); 0 = the chip's other
        profile (see datasheet Table 8). capacity_mah picks APA from Table 7."""
        self.i2c = i2c
        self.addr = addr
        if init:
            self.begin(capacity_mah, profile)

    def _read_word(self, cmd):
        d = self.i2c.readfrom_mem(self.addr, cmd, 3)
        a = self.addr << 1
        if crc8(bytes((a, cmd, a | 1, d[0], d[1]))) != d[2]:
            raise OSError('LC709203F CRC mismatch: check the wiring')
        return d[0] | (d[1] << 8)

    def _write_word(self, cmd, value):
        lo, hi = value & 0xFF, (value >> 8) & 0xFF
        crc = crc8(bytes((self.addr << 1, cmd, lo, hi)))
        self.i2c.writeto_mem(self.addr, cmd, bytes((lo, hi, crc)))

    def wake(self):
        """Datasheet starting flow: in Sleep mode the first transfer only wakes the chip (an SDA
        pulse), so 'Set Operational mode' is sent twice."""
        try:
            self._write_word(REG_IC_POWER_MODE, POWER_OPERATIONAL)
        except OSError:
            pass
        time.sleep_ms(1)  # TWU is at most 400 us
        self._write_word(REG_IC_POWER_MODE, POWER_OPERATIONAL)

    def begin(self, capacity_mah=500, profile=1):
        self.wake()
        sizes = sorted(APA)
        best = min(sizes, key=lambda s: abs(s - capacity_mah))
        self._write_word(REG_APA, APA[best])
        self._write_word(REG_CHANGE_PARAMETER, profile)
        time.sleep_ms(100)  # changing the parameter re-initialises the chip (TINIT up to 90 ms)
        self._write_word(REG_INITIAL_RSOC, 0xAA55)
        time.sleep_ms(2)  # RSOC initialisation takes up to 1.5 ms

    def voltage_mv(self):
        """Cell voltage in mV (1 mV per LSB)."""
        return self._read_word(REG_CELL_VOLTAGE)

    def voltage(self):
        return self.voltage_mv() / 1000

    def percent(self):
        """RSOC, relative state of charge, 0-100 % (1 % per LSB)."""
        return self._read_word(REG_RSOC)

    def ite(self):
        """Indicator to empty, 0.0-100.0 % (0.1 % per LSB)."""
        return self._read_word(REG_ITE) / 10

    def temperature(self):
        """Cell temperature in degC (0.1 K per LSB, 0x0AAC = 0.0 degC)."""
        return (self._read_word(REG_CELL_TEMPERATURE) - 0x0AAC) / 10

    def set_temperature(self, celsius):
        """I2C temperature mode: tell the gauge the cell temperature (-20 to 60 degC)."""
        raw = int(round(celsius * 10)) + 0x0AAC
        self._write_word(REG_CELL_TEMPERATURE, max(0x09E4, min(0x0D04, raw)))

    def use_thermistor(self, b_constant=3950):
        """Measure a 10k NTC on THERM instead (set its B constant)."""
        self._write_word(REG_THERMISTOR_B, b_constant)
        self._write_word(REG_STATUS_BIT, 0x0001)

    def use_i2c_temperature(self):
        self._write_word(REG_STATUS_BIT, 0x0000)

    def set_alarm_percent(self, pct):
        """ALARMB (INT) goes low below this RSOC; 0 disables."""
        self._write_word(REG_ALARM_LOW_RSOC, pct)

    def set_alarm_voltage(self, mv):
        """ALARMB (INT) goes low below this cell voltage in mV; 0 disables."""
        self._write_word(REG_ALARM_LOW_VOLTAGE, mv)

    def ic_version(self):
        return self._read_word(REG_IC_VERSION)

    def sleep(self):
        self._write_word(REG_IC_POWER_MODE, POWER_SLEEP)
