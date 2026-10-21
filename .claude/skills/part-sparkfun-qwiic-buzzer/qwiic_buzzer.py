# SparkFun Qwiic Buzzer (BOB-24474), MicroPython driver.
# The board's ATtiny84 runs SparkFun's QwiicBuzzerFirmware, which exposes a byte register map
# (sfDevBuzzerRegisters.h / sfeQwiicBuzzerFirmware.h): write the register number, then read;
# a write of [reg, data...] stores the data from reg onwards. 16-bit values are big-endian
# (MSB register first). Device ID register 0x00 reads 0x5E. Default address 0x34.
from micropython import const

_ID = const(0x00)
_FW_MINOR = const(0x01)
_FW_MAJOR = const(0x02)
_FREQ_MSB = const(0x03)      # tone frequency in Hz, MSB (0x04 = LSB); 0 = rest (silent)
_VOLUME = const(0x05)        # 0 = off, 1 (quietest) ... 4 (loudest)
_DURATION_MSB = const(0x06)  # duration in ms, MSB (0x07 = LSB); 0 = until turned off
_ACTIVE = const(0x08)        # write 1 to buzz, 0 to stop; firmware clears it when a duration ends
_SAVE = const(0x09)          # write 1 to store frequency/volume/duration in EEPROM
_I2C_ADDRESS = const(0x0A)

DEVICE_ID = const(0x5E)
RESONANT_HZ = const(2730)    # the buzzer's loudest pitch, the factory default frequency

VOLUME_OFF = const(0)
VOLUME_MIN = const(1)
VOLUME_LOW = const(2)
VOLUME_MID = const(3)
VOLUME_MAX = const(4)


class QwiicBuzzer:
    def __init__(self, i2c, addr=0x34):
        self.i2c = i2c
        self.addr = addr
        if self._read(_ID, 1)[0] != DEVICE_ID:
            raise OSError('Qwiic Buzzer not found at 0x%02X (wrong ID)' % addr)

    # --- low level: pointer write (with STOP) then read, as SparkFun's library does
    def _read(self, reg, n):
        self.i2c.writeto(self.addr, bytes([reg]))
        return self.i2c.readfrom(self.addr, n)

    def _write(self, reg, data):
        self.i2c.writeto(self.addr, bytes([reg]) + bytes(data))

    # --- identity
    def firmware_version(self):
        return (self._read(_FW_MAJOR, 1)[0], self._read(_FW_MINOR, 1)[0])

    # --- sound
    def configure(self, frequency=RESONANT_HZ, duration_ms=0, volume=VOLUME_MAX):
        """frequency in Hz (0 = rest), duration_ms 0 = buzz until off(), volume 0-4.
        Written in one transfer from register 0x03, like the Arduino library's configureBuzzer()."""
        if not 0 <= frequency <= 0xFFFF or not 0 <= duration_ms <= 0xFFFF:
            raise ValueError('frequency and duration must be 0-65535')
        if not 0 <= volume <= 4:
            raise ValueError('volume must be 0-4')
        self._write(_FREQ_MSB, (frequency >> 8, frequency & 0xFF, volume,
                                duration_ms >> 8, duration_ms & 0xFF))

    def on(self):
        self._write(_ACTIVE, (1,))

    def off(self):
        self._write(_ACTIVE, (0,))

    def is_active(self):
        return bool(self._read(_ACTIVE, 1)[0] & 0x01)

    def settings(self):
        """(frequency Hz, volume, duration ms) as stored in the register map."""
        d = self._read(_FREQ_MSB, 5)
        return ((d[0] << 8) | d[1], d[2], (d[3] << 8) | d[4])

    def tone(self, frequency, duration_ms, volume=VOLUME_MAX):
        """Play one note and block until it has finished (the firmware times it)."""
        import time
        self.configure(frequency, duration_ms, volume)
        self.on()
        time.sleep_ms(duration_ms)

    def save_settings(self):
        """Store the current frequency, volume and duration in EEPROM as power-on defaults."""
        self._write(_SAVE, (1,))

    # --- address (stored in the ATtiny's EEPROM)
    def set_address(self, new_addr):
        if not 0x08 <= new_addr <= 0x77:
            raise ValueError('address must be 0x08-0x77')
        self._write(_I2C_ADDRESS, (new_addr,))
        self.addr = new_addr
