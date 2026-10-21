# Amphenol Telaire T6713 NDIR CO2 sensor, MicroPython I2C driver.
# Pin 6 (CTRL) must be tied to GND at power-up to select I2C (address 0x15, 100 kHz).
# The T67xx speaks Modbus wrapped in I2C (no CRC on I2C): write a Modbus request,
# wait 5-10 ms, then read the response. The sensor uses clock stretching.
import time

ADDR = 0x15
_FN_READ_INPUT = 0x04
_REG_FIRMWARE = 0x1389
_REG_STATUS = 0x138A
_REG_GAS_PPM = 0x138B

STATUS_ERROR = 0x0001
STATUS_FLASH_ERROR = 0x0002
STATUS_CAL_ERROR = 0x0004
STATUS_REBOOT = 0x0400
STATUS_WARMUP = 0x0800
STATUS_SINGLE_POINT_CAL = 0x8000


class T6713:
    def __init__(self, i2c, addr=ADDR):
        self.i2c = i2c
        self.addr = addr

    def _read_input(self, reg):
        # Modbus Read Input Registers (function 4), one register.
        self.i2c.writeto(self.addr, bytes([_FN_READ_INPUT, reg >> 8, reg & 0xFF, 0x00, 0x01]))
        time.sleep_ms(10)  # datasheet: wait 5-10 ms before reading the response
        r = self.i2c.readfrom(self.addr, 4)
        # Response: function code 0x04, byte count 0x02, MSB, LSB.
        if r[0] != _FN_READ_INPUT or r[1] != 0x02:
            raise OSError('T6713 bad response: check wiring and that CTRL is grounded')
        return (r[2] << 8) | r[3]

    def co2(self):
        """CO2 concentration in ppm (ppm = MSB * 256 + LSB)."""
        return self._read_input(_REG_GAS_PPM)

    def status(self):
        """Status bit-vector (0 = OK; 0x0800 = warming up)."""
        return self._read_input(_REG_STATUS)

    def firmware(self):
        return self._read_input(_REG_FIRMWARE)

    def warming_up(self):
        return bool(self.status() & STATUS_WARMUP)

    def reset(self):
        # Modbus Write Single Coil 0x03E8 = 0xFF00; the sensor resets at once and sends no response.
        self.i2c.writeto(self.addr, b'\x05\x03\xe8\xff\x00')
