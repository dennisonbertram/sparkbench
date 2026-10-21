# DFRobot Gravity I2C ozone sensor (SEN0321, Winsen ZE27-O3 behind an STM8 I2C bridge), MicroPython driver.
# Register map and sequences from DFRobot's DFRobot_OzoneSensor library:
#   0x03 MODE      0x00 = active (sensor uploads every second), 0x01 = passive (read on request)
#   0x04 REQUEST   write 0x00 in active mode, 0x01 in passive mode to fetch a new value
#   0x07/0x08      passive-mode concentration, high byte first, ppb
#   0x09/0x0A      active-mode concentration, high byte first, ppb
# Ozone (ppb) = high * 256 + low; ppm = ppb / 1000. Range 0-10 ppm, resolution 10 ppb.
import time

MODE_ACTIVE = 0x00
MODE_PASSIVE = 0x01

_REG_MODE = 0x03
_REG_REQUEST = 0x04
_REG_PASSIVE_DATA = 0x07
_REG_ACTIVE_DATA = 0x09


class GravityOzone:
    def __init__(self, i2c, addr=0x73, mode=MODE_PASSIVE):
        self.i2c = i2c
        self.addr = addr
        self.set_mode(mode)

    def set_mode(self, mode):
        if mode not in (MODE_ACTIVE, MODE_PASSIVE):
            raise ValueError('mode must be MODE_ACTIVE or MODE_PASSIVE')
        self.i2c.writeto(self.addr, bytes([_REG_MODE, mode]))
        time.sleep_ms(100)  # the bridge MCU forwards the mode command to the ZE27-O3 over UART
        self.mode = mode

    def _read_word(self, reg):
        # Same sequence as DFRobot's library: set the register pointer (with STOP), wait, then read 2 bytes.
        self.i2c.writeto(self.addr, bytes([reg]))
        time.sleep_ms(100)
        d = self.i2c.readfrom(self.addr, 2)
        return (d[0] << 8) | d[1]

    def read_ppb(self):
        """Ozone concentration in ppb (parts per billion)."""
        if self.mode == MODE_PASSIVE:
            self.i2c.writeto(self.addr, bytes([_REG_REQUEST, 0x01]))  # request one reading
            time.sleep_ms(100)
            return self._read_word(_REG_PASSIVE_DATA)
        self.i2c.writeto(self.addr, bytes([_REG_REQUEST, 0x00]))
        time.sleep_ms(100)
        return self._read_word(_REG_ACTIVE_DATA)

    def read_ppm(self):
        return self.read_ppb() / 1000
