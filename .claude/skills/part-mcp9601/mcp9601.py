# MCP9601 / MCP96L01 thermocouple EMF-to-temperature converter with open/short detection
# (Microchip MCP960X/L0X/RL0X datasheet DS20005426), MicroPython driver.
# Register pointer write, STOP, then a separate read (Figure 4-3); the chip keeps the pointer between reads.
# Temperatures are 16-bit two's complement, 0.0625 degC/LSB (Equations 5-1 and 5-3).
# The chip stretches SCL for up to 60 us per byte read (tSTRETCH): run the bus at 100 kHz.
import time

_TH = 0x00       # hot-junction (thermocouple) temperature, cold-junction compensated
_TDELTA = 0x01   # junctions temperature delta (TH - TC)
_TC = 0x02       # cold-junction (board) temperature
_STATUS = 0x04   # 8-bit status register (Register 5-6)
_SENSOR_CFG = 0x05
_DEVICE_CFG = 0x06
_DEVICE_ID = 0x20

# STATUS bits (Register 5-6, MCP9601/L01/RL01)
ST_BURST_COMPLETE = 0x80
ST_TH_UPDATE = 0x40
ST_SHORT_CIRCUIT = 0x20  # thermocouple shorted to VDD or GND (needs VSENSE wired, as on the Adafruit board)
ST_OPEN_CIRCUIT = 0x10   # thermocouple disconnected / input out of range

TYPES = {'K': 0, 'J': 1, 'T': 2, 'N': 3, 'S': 4, 'E': 5, 'B': 6, 'R': 7}


class MCP9601:
    def __init__(self, i2c, addr=0x67, tc_type='K', filter_n=0):
        self.i2c = i2c
        self.addr = addr
        time.sleep_ms(20)  # tPOR power-up time
        dev_id = self._read(_DEVICE_ID, 2)[0]
        if dev_id != 0x41:  # Register 5-13: 0x41 = MCP9601/L01/RL01 (0x40 would be an MCP9600)
            raise OSError('MCP9601 not found (device ID 0x%02X)' % dev_id)
        # Sensor configuration: bits 6-4 thermocouple type, bits 2-0 IIR filter coefficient.
        self._write(_SENSOR_CFG, (TYPES[tc_type] << 4) | (filter_n & 0x07))
        # Device configuration: 0.0625 degC cold-junction, 18-bit ADC, normal (continuous) mode.
        self._write(_DEVICE_CFG, 0x00)

    def _write(self, reg, value):
        self.i2c.writeto(self.addr, bytes([reg, value]))

    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _temp(self, reg):
        d = self._read(reg, 2)
        upper, lower = d[0], d[1]
        if upper & 0x80:  # negative: Equation 5-1, T < 0 degC
            return (upper * 16 + lower / 16) - 4096
        return upper * 16 + lower / 16

    def temperature(self):
        """Thermocouple (hot-junction) temperature in degC, cold-junction compensated."""
        return self._temp(_TH)

    def ambient(self):
        """Cold-junction (board) temperature in degC."""
        return self._temp(_TC)

    def delta(self):
        """Hot-junction minus cold-junction temperature in degC."""
        return self._temp(_TDELTA)

    def status(self):
        return self._read(_STATUS, 1)[0]

    def open_circuit(self):
        """True when the thermocouple is disconnected (STATUS bit 4)."""
        return bool(self.status() & ST_OPEN_CIRCUIT)

    def short_circuit(self):
        """True when the thermocouple is shorted to VDD or GND (STATUS bit 5)."""
        return bool(self.status() & ST_SHORT_CIRCUIT)

    def fault(self):
        """'OPEN', 'SHORT' or 'OK'."""
        s = self.status()
        if s & ST_OPEN_CIRCUIT:
            return 'OPEN'
        if s & ST_SHORT_CIRCUIT:
            return 'SHORT'
        return 'OK'
