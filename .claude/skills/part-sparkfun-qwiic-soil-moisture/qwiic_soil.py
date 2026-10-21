# SparkFun Qwiic Soil Moisture Sensor (SEN-17731), MicroPython driver.
# The board's ATtiny85 runs the Zio/SparkFun "Qwiic Soil Moisture" gateway firmware: a one-byte
# command protocol, not a register map (Qwiic_Soil_Moisture_Firmware.ino):
#   0x00 = LED off, 0x01 = LED on, 0x03 <addr> = change I2C address (EEPROM, 0x08-0x77),
#   0x05 = get value: the next read returns the 10-bit ADC reading, LOW byte first, then HIGH byte.
# The ADC reads the probe pads against a 100 kOhm pull-up to 3.3 V (VCC reference), so
# raw = 1024 * Rprobe / (Rprobe + 100k), capped at 1023: 1023 = dry (open probe), lower = wetter.
import time

CMD_LED_OFF = 0x00
CMD_LED_ON = 0x01
CMD_CHANGE_ADDRESS = 0x03
CMD_GET_VALUE = 0x05

MAX_VALUE = 1023
PULLUP_OHMS = 100000


class QwiicSoilMoisture:
    def __init__(self, i2c, addr=0x28):
        self.i2c = i2c
        self.addr = addr

    def _cmd(self, c):
        self.i2c.writeto(self.addr, bytes([c]))

    def led_on(self):
        self._cmd(CMD_LED_ON)

    def led_off(self):
        self._cmd(CMD_LED_OFF)

    def read_raw(self):
        """10-bit ADC reading 0-1023 (0 = probes shorted by water, 1023 = dry / in air)."""
        self._cmd(CMD_GET_VALUE)
        time.sleep_ms(1)  # let the ATtiny's I2C interrupt latch the command
        d = self.i2c.readfrom(self.addr, 2)
        return (d[0] | (d[1] << 8)) & 0x3FF

    def read_ratio(self):
        """Wetness 0.0 (dry) to 1.0 (wet), as SparkFun's library computes it: (1023 - raw) / 1023."""
        return (MAX_VALUE - self.read_raw()) / MAX_VALUE

    def read_percent(self):
        return self.read_ratio() * 100.0

    def probe_ohms(self):
        """Resistance between the probe pads in ohms (None when open / dry: raw 1023)."""
        raw = self.read_raw()
        if raw >= MAX_VALUE:
            return None
        return PULLUP_OHMS * raw / (1024 - raw)

    def change_address(self, new_addr):
        """Store a new I2C address (0x08-0x77) in the board's EEPROM; it answers there at once."""
        if not 0x07 < new_addr < 0x78:
            raise ValueError('address must be 0x08-0x77')
        self.i2c.writeto(self.addr, bytes([CMD_CHANGE_ADDRESS, new_addr]))
        self.addr = new_addr
