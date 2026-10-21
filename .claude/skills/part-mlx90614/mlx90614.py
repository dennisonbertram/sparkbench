# MLX90614 infrared thermometer (Melexis), MicroPython driver.
# SMBus "read word" of a RAM cell: write the command (RAM address), repeated START,
# read LSByte then MSByte (the chip then sends a PEC byte, which the master may skip).
# Bus clock must be 10-100 kHz (datasheet 4.1.4).
# Ta is RAM 0x06, Tobj1 is RAM 0x07, Tobj2 (dual-zone parts only) is RAM 0x08.
# T[K] = raw * 0.02; the MSb of the word is an error flag (datasheet 4.1.8).

_RAM_TA = 0x06
_RAM_TOBJ1 = 0x07
_RAM_TOBJ2 = 0x08


class MLX90614:
    def __init__(self, i2c, addr=0x5A):
        self.i2c = i2c
        self.addr = addr

    def _read_temp(self, ram):
        # readfrom_mem sends the command, then a repeated START and the read, as the chip requires.
        d = self.i2c.readfrom_mem(self.addr, ram, 2)
        raw = d[0] | (d[1] << 8)  # LSByte first
        if raw & 0x8000:
            raise OSError('MLX90614 error flag set in RAM 0x%02X' % ram)
        return raw * 0.02 - 273.15

    def ambient(self):
        """Sensor (package) temperature Ta in deg C."""
        return self._read_temp(_RAM_TA)

    def object(self):
        """Object temperature Tobj1 in deg C (what the sensor is pointed at)."""
        return self._read_temp(_RAM_TOBJ1)

    def object2(self):
        """Second-zone object temperature (dual-zone MLX90614xBx/xCx parts only)."""
        return self._read_temp(_RAM_TOBJ2)
