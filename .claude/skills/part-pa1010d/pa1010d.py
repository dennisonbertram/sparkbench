# CDtop PA1010D GNSS module (MediaTek MT3333), MicroPython NMEA driver for the UART interface.
# CD-PA1010D datasheet v.03:
#   - NMEA 0183 output on TX, default 9600 baud 8N1, 1 Hz update (section 2.6);
#   - default system GPS+GLONASS, so position sentences are $GNGGA / $GNRMC; after $PMTK353,1,0,0,0,0
#     they become $GPGGA / $GPRMC (section 3.1, Table-2), so the talker ID is not checked here;
#   - latitude ddmm.mmmm, longitude dddmm.mmmm; GGA fix indicator 0 = no fix, 1 GPS, 2 DGPS;
#     RMC status A = valid, V = not valid (Tables 3, 4, 10);
#   - checksum = XOR of every character between '$' and '*', two hex digits.
# Commands are MediaTek PMTK sentences ($PMTKxxx,...*CS), acknowledged by $PMTK001,xxx,flag (3 = success).


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
    # 'ddmm.mmmm' (dlen=2) or 'dddmm.mmmm' (dlen=3) -> signed decimal degrees, None if empty
    if not field or not hemi:
        return None
    d = int(field[:dlen]) + float(field[dlen:]) / 60
    return -d if hemi in ('S', 'W') else d


def _num(field):
    return float(field) if field else None


class PA1010D:
    def __init__(self, uart):
        """uart: machine.UART at 9600 baud 8N1, rx= the pin wired to the board's TXO
        (and tx= the pin wired to RXI if you want to send PMTK commands)."""
        self.uart = uart
        self._buf = b''
        self.fix = False          # True when GGA fix indicator > 0 or RMC status 'A'
        self.fix_quality = 0      # GGA: 0 no fix, 1 GPS fix, 2 differential (SBAS) fix
        self.latitude = None      # decimal degrees, + north
        self.longitude = None     # decimal degrees, + east
        self.altitude = None      # metres above mean sea level (GGA)
        self.satellites = 0       # satellites used (GGA)
        self.hdop = None
        self.speed_knots = None   # speed over ground (RMC)
        self.course = None        # course over ground, degrees true (RMC)
        self.utc_time = None      # (hh, mm, ss)
        self.date = None          # (day, month, 2-digit year)
        self.talker = None        # 'GN', 'GP' or 'GL' of the last position sentence
        self.last_ack = None      # (command number, flag) from the last $PMTK001
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
        if f[0] == 'PMTK001' and len(f) >= 3:
            self.last_ack = (int(f[1]), int(f[2]))
            return False
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
        return False

    def _time(self, t):
        if len(t) >= 6:
            self.utc_time = (int(t[0:2]), int(t[2:4]), int(float(t[4:])))

    # ---- PMTK commands (need RXI wired to the board's UART TX) --------------------------
    def send(self, body):
        """Send a sentence; body is the text between '$' and '*', e.g. 'PMTK220,1000'."""
        self.uart.write('$%s*%02X\r\n' % (body, _xor(body)))

    def set_output_rmc_gga(self):
        """Only send RMC and GGA (PMTK314 fields: GLL, RMC, VTG, GGA, GSA, GSV, ...)."""
        self.send('PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0')

    def set_output_default(self):
        """Back to the factory sentence set (PMTK314,-1)."""
        self.send('PMTK314,-1')

    def set_update_ms(self, ms):
        """NMEA update interval, 100 (10 Hz) to 10000 ms (PMTK220). At 9600 baud, faster than
        1 Hz needs fewer sentences (set_output_rmc_gga) or a higher baud rate."""
        if not 100 <= ms <= 10000:
            raise ValueError('interval must be 100..10000 ms')
        self.send('PMTK220,%d' % ms)

    def set_baud(self, baud):
        """Change the module's baud rate (PMTK251); reopen your UART at the new rate afterwards."""
        if baud not in (9600, 19200, 38400, 57600, 115200):
            raise ValueError('unsupported baud rate')
        self.send('PMTK251,%d' % baud)

    def restart(self, kind=0):
        """0 hot (PMTK101), 1 warm (PMTK102), 2 cold (PMTK103), 3 full cold / factory (PMTK104)."""
        self.send('PMTK%d' % (101 + kind))

    def standby(self):
        """Standby mode (PMTK161,0); any byte sent to RXI wakes it."""
        self.send('PMTK161,0')

    def wake(self):
        self.send('PMTK225,0')  # back to full-power continuous mode
