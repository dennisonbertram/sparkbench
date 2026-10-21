# VEML6070 UVA light sensor (Vishay datasheet doc 84277), MicroPython driver.
# The chip has no register pointer. It answers at three I2C addresses:
#   0x38  write: the 8-bit command register; read: UV data LSB
#   0x39  read: UV data MSB (never write to 0x39)
#   0x0C  alert response address (ARA): reading it clears a pending ACK alert
# Command byte: bit5 ACK enable, bit4 ACK_THD (0 = 102, 1 = 145 steps),
# bits3:2 IT (0 = 1/2T, 1 = 1T, 2 = 2T, 3 = 4T), bit1 reserved = 1, bit0 SD (1 = shutdown).
# Initialisation per datasheet: clear the ACK state, then write 0x06 (IT = 1T, running).
import time

_ADDR_CMD_LSB = 0x38
_ADDR_MSB = 0x39
_ADDR_ARA = 0x0C

IT_HALF = 0
IT_1 = 1
IT_2 = 2
IT_4 = 4
_IT_BITS = {IT_HALF: 0, IT_1: 1, IT_2: 2, IT_4: 3}

# UV risk bands in steps at IT = 1T with RSET = 270 k (Vishay app note 84310, as used
# by Adafruit's library). Scale the reading to 1T before comparing.
_RISK = ((560, 'LOW'), (1120, 'MODERATE'), (1494, 'HIGH'), (2054, 'VERY HIGH'))


class VEML6070:
    def __init__(self, i2c, it=IT_1, rset_kohm=270):
        if it not in _IT_BITS:
            raise ValueError('it must be IT_HALF, IT_1, IT_2 or IT_4')
        self.i2c = i2c
        self.it = it
        # 1T refresh time scales with RSET: 125 ms at 300 k (datasheet table 4);
        # Adafruit measured about 126 ms on its 270 k board, so add 10 % margin.
        self._t1_ms = max(125, rset_kohm * 125 // 300) * 11 // 10
        self.clear_ack()
        self._cmd = (_IT_BITS[it] << 2) | 0x02  # ACK off, SD = 0 (running)
        self._write()
        self.wait()

    def _write(self):
        self.i2c.writeto(_ADDR_CMD_LSB, bytes([self._cmd]))

    def clear_ack(self):
        """Read the alert response address; returns True if an alert was pending."""
        try:
            self.i2c.readfrom(_ADDR_ARA, 1)
            return True
        except OSError:
            return False  # no alert pending: the chip does not answer at 0x0C

    def wait(self):
        """Sleep one refresh period of the current integration time."""
        t = self._t1_ms // 2 if self.it == IT_HALF else self._t1_ms * self.it
        time.sleep_ms(t + 5)

    def raw(self):
        """UV reading in steps (0..65535): MSB from 0x39, then LSB from 0x38."""
        msb = self.i2c.readfrom(_ADDR_MSB, 1)[0]
        lsb = self.i2c.readfrom(_ADDR_CMD_LSB, 1)[0]
        return (msb << 8) | lsb

    def risk(self, steps=None):
        """UV risk level (LOW .. EXTREME) from the app note bands; not for IT_HALF."""
        if self.it == IT_HALF:
            raise ValueError('risk bands are defined for IT_1, IT_2 and IT_4 only')
        if steps is None:
            steps = self.raw()
        s = steps // self.it
        for top, name in _RISK:
            if s <= top:
                return name
        return 'EXTREME'

    def set_ack(self, enable=True, threshold_145=False):
        """Enable the ACK pin alert when the reading exceeds 102 (or 145) steps."""
        self._cmd = (self._cmd & ~0x30) | (0x20 if enable else 0) | (0x10 if threshold_145 else 0)
        self.clear_ack()
        self._write()

    def sleep(self, off=True):
        """Shutdown mode (about 1 uA). off=False starts measuring again."""
        self._cmd = (self._cmd | 0x01) if off else (self._cmd & ~0x01)
        self._write()
        if not off:
            self.wait()
