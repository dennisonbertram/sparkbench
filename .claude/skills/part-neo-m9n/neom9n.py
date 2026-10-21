# u-blox NEO-M9N GNSS receiver (SparkFun GPS Breakout NEO-M9N), MicroPython NMEA driver for the UART.
# NEO-M9N-00B datasheet (UBX-19014285) 5.5 "Default interface settings": UART 38400 baud, 8N1,
# output NMEA GGA, GLL, GSA, GSV, RMC, VTG, TXT (no UBX), 1 Hz navigation.
# The receiver tracks GPS + GLONASS + Galileo + BeiDou concurrently, so combined position sentences
# use the talker ID "GN" ($GNGGA, $GNRMC); this driver accepts any talker ID.
# Every sentence is checked with its NMEA checksum (XOR of all characters between '$' and '*').
# Latitude is ddmm.mmmmm, longitude dddmm.mmmmm (u-blox M9 interface description, NMEA GGA / RMC).


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


class NEOM9N:
    def __init__(self, uart):
        """uart: machine.UART at 38400 baud (factory default), rx= the pin wired to the module's TX/MISO."""
        self.uart = uart
        self._buf = b''
        self.fix = False          # True when GGA quality > 0 or RMC status 'A'
        self.fix_quality = 0      # GGA: 0 none, 1 GNSS fix, 2 DGNSS, 6 dead reckoning
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
        """Read what has arrived and decode complete sentences. Returns True if a GGA or RMC was decoded."""
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
            except UnicodeError:  # noise or a binary UBX frame
                continue
            try:
                if line and self._parse(line):
                    got = True
            except (ValueError, IndexError):  # malformed field
                pass
        if len(self._buf) > 1024:  # garbage without newlines (wrong baud rate?)
            self._buf = b''
        return got

    def _parse(self, line):
        if line[:1] != '$':
            return False
        if not _checksum_ok(line):
            self.bad_checksums += 1
            return False
        f = line[1:line.rfind('*')].split(',')
        kind = f[0][2:]  # skip the talker ID (GN, GP, GL, GA, GB)
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
