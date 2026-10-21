# CCS811 eCO2 / TVOC gas sensor (ams CCS811), MicroPython driver.
# Written from the ams CCS811 datasheet (DS000459): HW_ID 0x20 must read 0x81, the chip boots in
# boot mode and is switched to the application by a single-byte write of 0xF4 (APP_START), then
# MEAS_MODE (0x01) selects the drive mode. ALG_RESULT_DATA (0x02) returns eCO2 (ppm, 16 bit),
# TVOC (ppb, 16 bit), STATUS, ERROR_ID and RAW_DATA, MSB first.
# nWAKE (WAK on the board) must be low before and during every I2C transaction.
# The CCS811 stretches the I2C clock; use a hardware I2C bus at 10-400 kHz (100 kHz recommended).
import time

STATUS = 0x00
MEAS_MODE = 0x01
ALG_RESULT_DATA = 0x02
ENV_DATA = 0x05
BASELINE = 0x11
HW_ID = 0x20
ERROR_ID = 0xE0
APP_START = 0xF4
SW_RESET = 0xFF

_ERRORS = ('WRITE_REG_INVALID', 'READ_REG_INVALID', 'MEASMODE_INVALID', 'MAX_RESISTANCE', 'HEATER_FAULT', 'HEATER_SUPPLY')


class CCS811:
    def __init__(self, i2c, addr=0x5A, mode=1, wake=None):
        """mode: 1 = every second, 2 = every 10 s, 3 = every 60 s (4 = raw only, no eCO2/TVOC).
        wake: optional machine.Pin (set as Pin.OUT) wired to WAK; it is driven low to keep the chip awake."""
        self.i2c = i2c
        self.addr = addr
        if wake is not None:
            wake.value(0)
            time.sleep_us(50)  # tAWAKE
        time.sleep_ms(20)  # tSTART after power on
        if self._read(HW_ID, 1)[0] != 0x81:
            raise OSError('CCS811 not found (HW_ID is not 0x81): check wiring and that WAK is low')
        st = self._read(STATUS, 1)[0]
        if not st & 0x80:  # FW_MODE 0: still in boot mode
            if not st & 0x10:
                raise OSError('CCS811 has no valid application firmware (APP_VALID is 0)')
            self.i2c.writeto(self.addr, bytes([APP_START]))  # single-byte write starts the application
            time.sleep_ms(100)
            st = self._read(STATUS, 1)[0]
            if not st & 0x80:
                raise OSError('CCS811 did not enter application mode')
        if st & 0x01:
            self._raise_error()
        self.set_mode(mode)

    def _read(self, reg, n):
        return self.i2c.readfrom_mem(self.addr, reg, n)

    def _raise_error(self):
        e = self._read(ERROR_ID, 1)[0]
        names = [n for i, n in enumerate(_ERRORS) if e & (1 << i)]
        raise OSError('CCS811 error 0x%02X %s' % (e, ' '.join(names)))

    def set_mode(self, mode):
        """DRIVE_MODE in bits 6:4 of MEAS_MODE; interrupts left disabled."""
        if mode not in (0, 1, 2, 3, 4):
            raise ValueError('mode must be 0-4')
        self.i2c.writeto(self.addr, bytes([MEAS_MODE, mode << 4]))

    def status(self):
        return self._read(STATUS, 1)[0]

    def data_ready(self):
        """True when a new sample is waiting in ALG_RESULT_DATA (STATUS bit 3)."""
        st = self.status()
        if st & 0x01:
            self._raise_error()
        return bool(st & 0x08)

    def read(self):
        """Return (eCO2 in ppm, TVOC in ppb) from ALG_RESULT_DATA."""
        d = self._read(ALG_RESULT_DATA, 8)
        if d[4] & 0x01:  # STATUS byte: ERROR
            names = [n for i, n in enumerate(_ERRORS) if d[5] & (1 << i)]
            raise OSError('CCS811 error 0x%02X %s' % (d[5], ' '.join(names)))
        eco2 = (d[0] << 8) | d[1]
        tvoc = (d[2] << 8) | d[3]
        return eco2, tvoc

    def set_environment(self, humidity, temperature):
        """Give the chip the air's relative humidity (%) and temperature (°C) for compensation.
        Both are unsigned 16-bit values in 1/512 units; temperature has a +25 °C offset."""
        h = max(0, min(0xFFFF, int(round(humidity * 512))))
        t = max(0, min(0xFFFF, int(round((temperature + 25) * 512))))
        self.i2c.writeto(self.addr, bytes([ENV_DATA, h >> 8, h & 0xFF, t >> 8, t & 0xFF]))

    def get_baseline(self):
        """The encoded clean-air baseline (2 bytes), to save and restore later (ams AN000370)."""
        d = self._read(BASELINE, 2)
        return (d[0] << 8) | d[1]

    def set_baseline(self, value):
        self.i2c.writeto(self.addr, bytes([BASELINE, (value >> 8) & 0xFF, value & 0xFF]))

    def reset(self):
        """Software reset: back to boot mode (create a new CCS811 object afterwards)."""
        self.i2c.writeto(self.addr, bytes([SW_RESET, 0x11, 0xE5, 0x72, 0x8A]))
        time.sleep_ms(20)
