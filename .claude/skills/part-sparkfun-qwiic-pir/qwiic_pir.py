# SparkFun Qwiic PIR (SEN-17374, Panasonic EKMC4607112K 170 uA), MicroPython driver.
# The board's ATtiny84 runs SparkFun's Qwiic_PIR firmware (v1.1), which exposes a byte-addressed
# register map: write the register number, then read. Multi-byte registers are little-endian (AVR).
# Device ID register 0x00 reads 0x72. Default address 0x12 (0x13 with the ADR jumper cut).
from micropython import const

_ID = const(0x00)
_FW_MINOR = const(0x01)
_FW_MAJOR = const(0x02)
_STATUS = const(0x03)            # bit0 rawReading, bit1 eventAvailable, bit2 objectRemoved, bit3 objectDetected
_INT_CONFIG = const(0x04)        # bit0 interruptEnable
_DEBOUNCE = const(0x05)          # uint16 ms
_DETECT_Q_STATUS = const(0x07)   # bit0 popRequest, bit1 isEmpty, bit2 isFull
_DETECT_Q_FRONT = const(0x08)    # uint32 ms since newest detection
_DETECT_Q_BACK = const(0x0C)     # uint32 ms since oldest detection
_REMOVE_Q_STATUS = const(0x10)
_REMOVE_Q_FRONT = const(0x11)
_REMOVE_Q_BACK = const(0x15)
_I2C_ADDRESS = const(0x19)

DEVICE_ID = const(0x72)
DEFAULT_ADDRESS = const(0x12)


class QwiicPIR:
    def __init__(self, i2c, addr=DEFAULT_ADDRESS):
        self.i2c = i2c
        self.addr = addr
        if self._read(_ID, 1)[0] != DEVICE_ID:
            raise OSError('Qwiic PIR not found at 0x%02X (wrong ID)' % addr)

    # --- low level: pointer write (with STOP) then read, as SparkFun's library does
    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, data):
        self.i2c.writeto(self.addr, bytes([reg]) + bytes(data))

    def _read_u16(self, reg):
        d = self._read(reg, 2)
        return d[0] | (d[1] << 8)

    def _read_u32(self, reg):
        d = self._read(reg, 4)
        return d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)

    # --- identity
    def device_id(self):
        return self._read(_ID, 1)[0]

    def firmware_version(self):
        return (self._read(_FW_MAJOR, 1)[0], self._read(_FW_MINOR, 1)[0])

    # --- PIR state
    def status(self):
        return self._read(_STATUS, 1)[0]

    def raw_reading(self):
        """Live (not debounced) PIR output: True while the sensor reports motion."""
        return bool(self.status() & 0x01)

    def available(self):
        """True when a new debounced detect/remove event happened since clear_event_bits()."""
        return bool(self.status() & 0x02)

    def object_removed(self):
        return bool(self.status() & 0x04)

    def object_detected(self):
        return bool(self.status() & 0x08)

    def clear_event_bits(self):
        """Clear eventAvailable, objectRemoved and objectDetected (also releases INT)."""
        self._write(_STATUS, (self.status() & ~0x0E & 0xFF,))

    def debounce_ms(self):
        return self._read_u16(_DEBOUNCE)

    def set_debounce_ms(self, ms):
        ms = max(0, min(0xFFFF, int(ms)))
        self._write(_DEBOUNCE, (ms & 0xFF, (ms >> 8) & 0xFF))

    # --- interrupt pin (INT, active low, open drain with 10 k pull-up on the board)
    def enable_interrupt(self, on=True):
        v = self._read(_INT_CONFIG, 1)[0]
        v = (v | 0x01) if on else (v & ~0x01 & 0xFF)
        self._write(_INT_CONFIG, (v,))

    # --- event queues (timestamps are milliseconds ago)
    def detected_queue_empty(self):
        return bool(self._read(_DETECT_Q_STATUS, 1)[0] & 0x02)

    def time_since_last_detect(self):
        return self._read_u32(_DETECT_Q_FRONT)

    def pop_detected_queue(self):
        t = self._read_u32(_DETECT_Q_BACK)
        s = self._read(_DETECT_Q_STATUS, 1)[0]
        self._write(_DETECT_Q_STATUS, (s | 0x01,))
        return t

    def removed_queue_empty(self):
        return bool(self._read(_REMOVE_Q_STATUS, 1)[0] & 0x02)

    def time_since_last_remove(self):
        return self._read_u32(_REMOVE_Q_FRONT)

    def pop_removed_queue(self):
        t = self._read_u32(_REMOVE_Q_BACK)
        s = self._read(_REMOVE_Q_STATUS, 1)[0]
        self._write(_REMOVE_Q_STATUS, (s | 0x01,))
        return t

    # --- address (kept in the ATtiny's EEPROM; a cut ADR jumper overrides it with 0x13)
    def set_address(self, new_addr):
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(_I2C_ADDRESS, (new_addr,))
        self.addr = new_addr
