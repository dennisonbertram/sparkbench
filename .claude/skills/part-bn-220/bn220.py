# Beitian BN-220 GPS module (u-blox M8030-KT), MicroPython driver.
# The module streams NMEA-0183 sentences at 9600 baud, 8N1, once per second by default
# (GGA, GLL, GSA, GSV, RMC, VTG). This driver reads GGA (position, altitude, fix, satellites)
# and RMC (time, date, validity, speed, course). The talker ID may be GP, GN, GL, GA or GB
# ("xxGGA" in the datasheet), so only the sentence type is matched. Every sentence's
# checksum (XOR of the characters between '$' and '*') is verified before it is used.


def _checksum_ok(line):
    star = line.rfind(b'*')
    if not line.startswith(b'$') or star < 0 or len(line) < star + 3:
        return False
    cs = 0
    for c in line[1:star]:
        cs ^= c
    try:
        return cs == int(line[star + 1:star + 3], 16)
    except ValueError:
        return False


def _coord(value, hemi):
    """ddmm.mmmmm / dddmm.mmmmm + N/S/E/W -> signed decimal degrees (None if empty).
    Degrees and whole minutes are parsed as integers to keep precision on single-precision floats."""
    if not value or not hemi:
        return None
    whole, _, frac = value.partition('.')
    deg = int(whole[:-2])
    minutes = int(whole[-2:]) + (float('0.' + frac) if frac else 0.0)
    d = deg + minutes / 60
    return -d if hemi in ('S', 'W') else d


def _num(s, conv=float):
    return conv(s) if s else None


class BN220:
    def __init__(self, uart):
        """uart: machine.UART at 9600 baud (the module's default), RX wired to the module's TX."""
        self.uart = uart
        self._buf = b''
        self.latitude = None      # decimal degrees, + north
        self.longitude = None     # decimal degrees, + east
        self.altitude = None      # metres above mean sea level (GGA)
        self.fix_quality = 0      # GGA: 0 no fix, 1 GPS, 2 DGPS, 6 dead reckoning
        self.satellites = 0       # satellites used (GGA)
        self.hdop = None
        self.valid = False        # RMC status A = data valid
        self.speed_knots = None   # RMC speed over ground
        self.course = None        # RMC course over ground, degrees true
        self.time = None          # (h, m, s) UTC
        self.date = None          # (day, month, year)

    def update(self):
        """Read whatever has arrived and parse complete sentences.
        Returns True when a new GGA position with a fix was decoded."""
        new_fix = False
        while self.uart.any():
            chunk = self.uart.read()
            if not chunk:
                break
            self._buf += chunk
        while b'\n' in self._buf:
            line, self._buf = self._buf.split(b'\n', 1)
            if self._parse(line.strip()):
                new_fix = True
        if len(self._buf) > 512:  # garbage without line ends (wrong baud rate?)
            self._buf = b''
        return new_fix

    @property
    def has_fix(self):
        return self.fix_quality > 0

    def _parse(self, line):
        if not _checksum_ok(line):
            return False
        f = line[1:line.rfind(b'*')].decode().split(',')
        kind = f[0][2:]
        if kind == 'GGA' and len(f) >= 10:
            self._time(f[1])
            self.fix_quality = _num(f[6], int) or 0
            self.satellites = _num(f[7], int) or 0
            self.hdop = _num(f[8])
            if self.fix_quality > 0:
                self.latitude = _coord(f[2], f[3])
                self.longitude = _coord(f[4], f[5])
                self.altitude = _num(f[9])
                return True
        elif kind == 'RMC' and len(f) >= 10:
            self._time(f[1])
            self.valid = f[2] == 'A'
            if self.valid:
                self.latitude = _coord(f[3], f[4])
                self.longitude = _coord(f[5], f[6])
                self.speed_knots = _num(f[7])
                self.course = _num(f[8])
            if len(f[9]) == 6:
                self.date = (int(f[9][0:2]), int(f[9][2:4]), 2000 + int(f[9][4:6]))
        return False

    def _time(self, s):
        if len(s) >= 6:
            self.time = (int(s[0:2]), int(s[2:4]), float(s[4:]))
