# u-blox NEO-7M GNSS receiver (Waveshare UART GPS NEO-7M-C module), MicroPython NMEA driver.
# The NEO-7M sends NMEA 0183 (v2.3) sentences on its UART at 9600 baud, 8N1 by default
# (NEO-7 data sheet UBX-13003830, "Default messages": GGA, GLL, GSA, GSV, RMC, VTG, TXT once per second).
# Each sentence is checked with its NMEA checksum (XOR of every character between '$' and '*').
# GGA / RMC are decoded as in the u-blox 7 Receiver Description: latitude ddmm.mmmmm,
# longitude dddmm.mmmmm (degrees + minutes). Talker is GP for GPS only (default),
# GL / GN when GLONASS is enabled, so the sentence type is read after the 2-letter talker.


def _checksum_ok(line):
    # line: str without CR/LF, starting with '$'
    star = line.rfind('*')
    if line[:1] != '$' or star < 0 or len(line) < star + 3:
        return False
    cs = 0
    for c in line[1:star]:
        cs ^= ord(c)
    try:
        return cs == int(line[star + 1:star + 3], 16)
    except ValueError:
        return False


def _deg(field, hemi, dlen):
    # 'ddmm.mmmmm' (dlen=2) or 'dddmm.mmmmm' (dlen=3) -> signed decimal degrees, None if empty
    if not field or not hemi:
        return None
    d = int(field[:dlen]) + float(field[dlen:]) / 60
    return -d if hemi in ('S', 'W') else d


def _num(field):
    return float(field) if field else None


class NEO7M:
    def __init__(self, uart):
        """uart: machine.UART at 9600 baud, rx= the pin wired to the module's TXD."""
        self.uart = uart
        self._buf = b''
        self.fix = False          # True when GGA fix quality > 0 or RMC status 'A'
        self.fix_quality = 0      # GGA: 0 none, 1 GNSS fix, 2 DGPS, 6 dead reckoning
        self.latitude = None      # decimal degrees, + north
        self.longitude = None     # decimal degrees, + east
        self.altitude = None      # metres above mean sea level (GGA)
        self.satellites = 0       # satellites used (GGA)
        self.hdop = None
        self.speed_knots = None   # speed over ground (RMC)
        self.course = None        # course over ground, degrees (RMC)
        self.utc_time = None      # (hh, mm, ss)
        self.date = None          # (day, month, 2-digit year)
        self.bad_checksums = 0

    def update(self):
        """Read whatever has arrived and decode complete sentences. Returns True if a GGA or RMC was decoded."""
        n = self.uart.any()
        if n:
            data = self.uart.read(n)
            if data:
                self._buf += data
        got = False
        while True:
            nl = self._buf.find(b'\n')
            if nl < 0:
                break
            line = self._buf[:nl].strip()
            self._buf = self._buf[nl + 1:]
            try:
                line = line.decode()
            except UnicodeError:  # noise on the line
                self.bad_checksums += 1
                continue
            try:
                if line and self._parse(line):
                    got = True
            except (ValueError, IndexError):  # malformed field
                pass
        if len(self._buf) > 512:  # garbage without newlines (wrong baud rate?)
            self._buf = b''
        return got

    def _parse(self, line):
        if not _checksum_ok(line):
            self.bad_checksums += 1
            return False
        f = line[1:line.rfind('*')].split(',')
        kind = f[0][2:]
        if kind == 'GGA' and len(f) >= 10:
            self._time(f[1])
            self.fix_quality = int(f[6]) if f[6] else 0
            self.fix = self.fix_quality > 0
            self.satellites = int(f[7]) if f[7] else 0
            self.hdop = _num(f[8])
            if self.fix:
                self.latitude = _deg(f[2], f[3], 2)
                self.longitude = _deg(f[4], f[5], 3)
                self.altitude = _num(f[9])
            return True
        if kind == 'RMC' and len(f) >= 10:
            self._time(f[1])
            self.fix = f[2] == 'A'
            if self.fix:
                self.latitude = _deg(f[3], f[4], 2)
                self.longitude = _deg(f[5], f[6], 3)
                self.speed_knots = _num(f[7])
                self.course = _num(f[8])
            if len(f[9]) == 6:
                self.date = (int(f[9][0:2]), int(f[9][2:4]), int(f[9][4:6]))
            return True
        return False

    def _time(self, t):
        if len(t) >= 6:
            self.utc_time = (int(t[0:2]), int(t[2:4]), int(float(t[4:])))
