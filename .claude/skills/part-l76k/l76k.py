# Quectel L76K multi-GNSS receiver (GPS, BeiDou, GLONASS, QZSS), MicroPython NMEA driver.
# Per the Quectel L76K Hardware Design (V1.0, section 4.1.1.1) the module has one UART for NMEA output
# and command input, 9600 baud 8N1 by default (9600/19200/38400/57600/115200 supported), no flow control,
# 1 Hz updates (max 5 Hz). It speaks NMEA 0183 plus the CASIC proprietary $PCAS sentences (the L76K does
# NOT accept $PMTK commands):
#   - talker GP (GPS), BD (BeiDou), GL (GLONASS) or GN (several systems combined), so a multi-system
#     fix normally arrives as $GNGGA / $GNRMC;
#   - latitude ddmm.mmmmm, longitude dddmm.mmmmm (degrees then minutes);
#   - checksum = XOR of every character between '$' and '*', two hex digits.


def _xor(body):
    cs = 0
    for c in body:
        cs ^= ord(c)
    return cs


def _checksum_ok(line):
    # line: str without CR/LF, starting with '$'
    star = line.rfind('*')
    if line[:1] != '$' or star < 0 or len(line) < star + 3:
        return False
    try:
        return _xor(line[1:star]) == int(line[star + 1:star + 3], 16)
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


class L76K:
    # $PCAS04 constellation modes (CASIC protocol): bit0 GPS, bit1 BeiDou, bit2 GLONASS.
    GPS = 1
    BDS = 2
    GPS_BDS = 3
    GLONASS = 4
    GPS_GLONASS = 5
    BDS_GLONASS = 6
    ALL = 7
    _BAUDS = (4800, 9600, 19200, 38400, 57600, 115200)  # $PCAS01 codes 0..5

    def __init__(self, uart):
        """uart: machine.UART at 9600 baud, rx= the pin wired to the module's TX
        (and tx= the pin wired to the module's RX if you want to send settings)."""
        self.uart = uart
        self._buf = b''
        self.fix = False          # True when GGA quality > 0 or RMC status 'A'
        self.fix_quality = 0      # GGA: 0 invalid, 1 GPS fix, 2 DGPS, 6 dead reckoning
        self.latitude = None      # decimal degrees, + north
        self.longitude = None     # decimal degrees, + east
        self.altitude = None      # metres above mean sea level (GGA)
        self.satellites = 0       # satellites used (GGA)
        self.hdop = None
        self.speed_knots = None   # speed over ground (RMC)
        self.course = None        # course over ground, degrees true (RMC)
        self.utc_time = None      # (hh, mm, ss)
        self.date = None          # (day, month, 2-digit year)
        self.talker = None        # 'GN', 'GP', 'BD' or 'GL' of the last position sentence
        self.antenna = None       # 'OK', 'OPEN' or 'SHORT' from $GPTXT antenna messages
        self.bad_checksums = 0

    # ---- receiving -------------------------------------------------------------------
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
        talker, kind = f[0][:2], f[0][2:]
        if kind == 'GGA' and len(f) >= 10:
            self.talker = talker
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
            self.talker = talker
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
        if kind == 'TXT' and len(f) >= 5 and f[4].startswith('ANTENNA '):
            self.antenna = f[4][8:]
        return False

    def _time(self, t):
        if len(t) >= 6:
            self.utc_time = (int(t[0:2]), int(t[2:4]), int(float(t[4:])))

    # ---- configuration ($PCAS sentences; needs the module's RX pin wired) ---------------
    def send(self, body):
        """Send a sentence; body is the text between '$' and '*', e.g. 'PCAS02,1000'."""
        self.uart.write('$%s*%02X\r\n' % (body, _xor(body)))

    def set_update_ms(self, ms):
        """Fix interval: 1000 (1 Hz, default), 500 (2 Hz) or 200 ms (5 Hz, the L76K maximum)."""
        if ms not in (1000, 500, 200):
            raise ValueError('interval must be 1000, 500 or 200 ms')
        self.send('PCAS02,%d' % ms)

    def set_mode(self, mode):
        """Constellations: L76K.GPS, .BDS, .GPS_BDS, .GLONASS, .GPS_GLONASS, .BDS_GLONASS or .ALL."""
        if not 1 <= mode <= 7:
            raise ValueError('mode must be 1..7')
        self.send('PCAS04,%d' % mode)

    def set_baud(self, baud):
        """Change the module's baud rate ($PCAS01). Re-open your UART at the new rate afterwards."""
        self.send('PCAS01,%d' % self._BAUDS.index(baud))

    def restart(self, kind=0):
        """0 hot, 1 warm, 2 cold start, 3 cold start with factory reset ($PCAS10)."""
        self.send('PCAS10,%d' % kind)
