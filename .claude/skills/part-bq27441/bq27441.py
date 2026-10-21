# BQ27441-G1 single-cell Li-ion/LiPo fuel gauge (Texas Instruments SLUSBH1C datasheet and
# SLUUAC9A Technical Reference Manual), MicroPython driver.
#
# I2C address 0x55 (0xAA write / 0xAB read). "Standard commands" are 2-byte words at a
# command-code pair, LOW byte at the lower code (e.g. Voltage() = 0x04 low, 0x05 high).
#   Temperature()        0x02  unsigned, 0.1 K
#   Voltage()            0x04  unsigned, mV
#   Flags()              0x06  status bits (bit 3 BAT_DET, bit 4 CFGUPMODE, bit 5 ITPOR)
#   RemainingCapacity()  0x0C  unsigned, mAh
#   FullChargeCapacity() 0x0E  unsigned, mAh
#   AverageCurrent()     0x10  signed, mA (negative = discharging)
#   AveragePower()       0x18  signed, mW
#   StateOfCharge()      0x1C  unsigned, %
#   StateOfHealth()      0x20  low byte %, high byte status
# Control() subcommands are written to 0x00 (low byte) and 0x01 (high byte); the result is
# then read back from 0x00/0x01.
# Timing (datasheet 9.5.4.3): keep >= 66 us bus-free time between packets; above 100 kHz
# write subcommands as single-byte writes; do not hit the gauge with the same standard
# command more than twice a second (watchdog reset risk) - poll once a second.
import time

BQ27441_ADDR = 0x55

_CONTROL = 0x00
_TEMP = 0x02
_VOLT = 0x04
_FLAGS = 0x06
_REM_CAP = 0x0C
_FULL_CAP = 0x0E
_AVG_CURRENT = 0x10
_AVG_POWER = 0x18
_SOC = 0x1C
_SOH = 0x20
_DESIGN_CAP = 0x3C

# Control() subcommands
CONTROL_STATUS = 0x0000
DEVICE_TYPE = 0x0001  # returns 0x0421
FW_VERSION = 0x0002
DM_CODE = 0x0004


class BQ27441:
    def __init__(self, i2c, addr=BQ27441_ADDR):
        self.i2c = i2c
        self.addr = addr

    def _gap(self):
        time.sleep_us(100)  # t(BUF) >= 66 us between packets

    def _word(self, cmd, signed=False):
        b = self.i2c.readfrom_mem(self.addr, cmd, 2)
        self._gap()
        v = b[0] | (b[1] << 8)  # low byte first
        if signed and v & 0x8000:
            v -= 0x10000
        return v

    def control(self, sub):
        """Send a Control() subcommand and return the 16-bit word it reports."""
        # Two single-byte writes work at both 100 kHz and 400 kHz (datasheet 9.5.4.3).
        self.i2c.writeto_mem(self.addr, 0x00, bytes([sub & 0xFF]))
        self._gap()
        self.i2c.writeto_mem(self.addr, 0x01, bytes([(sub >> 8) & 0xFF]))
        time.sleep_ms(1)
        return self._word(_CONTROL)

    def device_type(self):
        """0x0421 on a working BQ27441 (TRM 4.1.2)."""
        return self.control(DEVICE_TYPE)

    def voltage(self):
        """Battery voltage in mV."""
        return self._word(_VOLT)

    def soc(self):
        """State of charge, % (0-100)."""
        return self._word(_SOC)

    def current(self):
        """Average current in mA: positive while charging, negative while discharging."""
        return self._word(_AVG_CURRENT, signed=True)

    def power(self):
        """Average power in mW: positive while charging, negative while discharging."""
        return self._word(_AVG_POWER, signed=True)

    def temperature(self):
        """Gauge temperature in degrees C (register is in 0.1 K)."""
        return self._word(_TEMP) / 10 - 273.15

    def remaining_capacity(self):
        """Remaining capacity, mAh (compensated for load and temperature)."""
        return self._word(_REM_CAP)

    def full_capacity(self):
        """Full-charge capacity, mAh."""
        return self._word(_FULL_CAP)

    def state_of_health(self):
        """(SOH %, status 0-3); status 0 = not valid yet."""
        w = self._word(_SOH)
        return w & 0xFF, w >> 8

    def design_capacity(self):
        """Design Capacity from data memory, mAh (1340 on -G1A, 1000 on -G1B by default)."""
        return self._word(_DESIGN_CAP)

    def flags(self):
        return self._word(_FLAGS)

    def battery_detected(self):
        return bool(self.flags() & 0x08)
