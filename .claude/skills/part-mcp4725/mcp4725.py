# MCP4725 12-bit I2C DAC (Microchip MCP4725), MicroPython driver.
# Commands from the Microchip datasheet DS22039D, section 6:
#   Fast mode write (C2 C1 = 0 0): [0 0 PD1 PD0 D11-D8] [D7-D0]
#   Write DAC register (C2 C1 C0 = 0 1 0): [0x40 | PD1 PD0 << 1] [D11-D4] [D3-D0 0000]
#   Write DAC register and EEPROM (0 1 1): [0x60 | PD << 1] [D11-D4] [D3-D0 0000], EEPROM write takes up to 50 ms
#   Read: 5 bytes [RDY/BSY POR x x x PD1 PD0 x] [D11-D4] [D3-D0 xxxx] [x PD1 PD0 x D11-D8] [D7-D0]
# Vout = VDD * code / 4096 (the supply is the reference).
import time

# Power-down modes (PD1 PD0): 0 normal, 1 = 1 kOhm, 2 = 100 kOhm, 3 = 500 kOhm to ground
PD_NORMAL = 0
PD_1K = 1
PD_100K = 2
PD_500K = 3


class MCP4725:
    def __init__(self, i2c, addr=0x62, vdd=3.3):
        """addr 0x62 with A0 low, 0x63 with A0 high (MCP4725A1, as on the Adafruit board).
        vdd: the supply voltage on VIN, which is the DAC's full-scale reference."""
        self.i2c = i2c
        self.addr = addr
        self.vdd = vdd

    def write(self, code, power_down=PD_NORMAL):
        """Fast-mode write of a 12-bit code (0-4095) to the DAC register. EEPROM is not changed."""
        code = max(0, min(4095, int(code)))
        self.i2c.writeto(self.addr, bytes([((power_down & 3) << 4) | (code >> 8), code & 0xFF]))

    def write_eeprom(self, code, power_down=PD_NORMAL):
        """Write the code to the DAC register AND the EEPROM (the value used at power-up)."""
        code = max(0, min(4095, int(code)))
        self.i2c.writeto(self.addr, bytes([0x60 | ((power_down & 3) << 1), code >> 4, (code & 0x0F) << 4]))
        # RDY/BSY stays low until the EEPROM write is done (typ 25 ms, max 50 ms)
        t0 = time.ticks_ms()
        while not self.read()[3]:
            if time.ticks_diff(time.ticks_ms(), t0) > 100:
                raise OSError('MCP4725 EEPROM write timed out')
            time.sleep_ms(5)

    def set_voltage(self, volts):
        """Set the output in volts (0 to vdd)."""
        self.write(round(volts * 4096 / self.vdd))

    def power_down(self, mode=PD_500K):
        """Switch the output off; it is pulled to ground through 1k/100k/500k."""
        self.write(0, mode)

    def read(self):
        """Return (dac_code, power_down, eeprom_code, ready)."""
        b = self.i2c.readfrom(self.addr, 5)
        dac = (b[1] << 4) | (b[2] >> 4)
        pd = (b[0] >> 1) & 3
        eeprom = ((b[3] & 0x0F) << 8) | b[4]
        ready = bool(b[0] & 0x80)
        return dac, pd, eeprom, ready
