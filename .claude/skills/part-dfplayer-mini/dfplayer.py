# DFPlayer Mini (DFRobot DFR0299, FN-M16P-compatible) serial MP3 player, MicroPython driver.
# Written from the FN-M16P Embedded MP3 Audio Module datasheet V1.0 (section 3):
# 9600 baud, 8N1. Every frame, both ways, is 10 bytes:
#   0x7E, version 0xFF, length 0x06, CMD, feedback (0x01 = send an ACK 0x41, 0x00 = no ACK),
#   parameter MSB, parameter LSB, checksum MSB, checksum LSB, 0xEF
#   checksum = 0xFFFF - (version + length + CMD + feedback + MSB + LSB) + 1   (i.e. minus the sum, 16 bits)
# Query commands (0x3F-0x4F) are answered with a frame carrying the same CMD and the result in the parameter.
import time

_START = 0x7E
_END = 0xEF
_VER = 0xFF
_LEN = 0x06

# Error codes the module returns with CMD 0x40 (datasheet 3.5.4)
ERRORS = {
    1: 'module busy (still initialising)',
    2: 'in sleep mode',
    3: 'serial receiving error (incomplete frame)',
    4: 'checksum incorrect',
    5: 'track out of range',
    6: 'track not found',
    7: 'insertion error (nothing is playing)',
    8: 'SD card reading failed',
    10: 'entered sleep mode',
}

EQ_NORMAL, EQ_POP, EQ_ROCK, EQ_JAZZ, EQ_CLASSIC, EQ_BASS = 0, 1, 2, 3, 4, 5
DEVICE_USB, DEVICE_SD = 1, 2
STOPPED, PLAYING, PAUSED = 0, 1, 2


def frame(cmd, param=0, feedback=0):
    """Build one 10-byte command frame with its checksum."""
    body = bytes((_VER, _LEN, cmd, 1 if feedback else 0, (param >> 8) & 0xFF, param & 0xFF))
    chk = -sum(body) & 0xFFFF
    return bytes((_START,)) + body + bytes((chk >> 8, chk & 0xFF, _END))


class DFPlayerError(OSError):
    pass


class DFPlayer:
    def __init__(self, uart):
        """uart: a machine.UART at 9600 baud; its TX goes to the module's RX (through 1 kOhm),
        its RX to the module's TX."""
        self.uart = uart
        self._buf = b''

    # ---- low level -----------------------------------------------------------------------
    def _flush(self):
        while self.uart.any():
            self.uart.read(self.uart.any())
        self._buf = b''

    def send(self, cmd, param=0, feedback=0):
        self.uart.write(frame(cmd, param, feedback))

    def read_frame(self, timeout_ms=500):
        """Return (cmd, param) of the next valid frame from the module, or None on timeout."""
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while True:
            while True:
                i = self._buf.find(bytes((_START,)))
                if i < 0:
                    self._buf = b''
                    break
                self._buf = self._buf[i:]
                if len(self._buf) < 10:
                    break
                f = self._buf[:10]
                if f[1] == _VER and f[2] == _LEN and f[9] == _END and \
                        (sum(f[1:7]) + ((f[7] << 8) | f[8])) & 0xFFFF == 0:
                    self._buf = self._buf[10:]
                    return f[3], (f[5] << 8) | f[6]
                self._buf = self._buf[1:]  # not a frame start (or corrupted): resync
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                return None
            n = self.uart.any()
            if n:
                got = self.uart.read(n)
                if got:
                    self._buf += got
            else:
                time.sleep_ms(5)

    def query(self, cmd, param=0, timeout_ms=500):
        """Send a query command and return the 16-bit parameter of the matching reply.
        Other frames that arrive meanwhile (track-finished 0x3C/0x3D, card inserted 0x3A...) are skipped."""
        self._flush()
        self.send(cmd, param)
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while True:
            left = time.ticks_diff(deadline, time.ticks_ms())
            if left <= 0:
                break
            r = self.read_frame(left)
            if r is None:
                break
            c, p = r
            if c == cmd:
                return p
            if c == 0x40:
                raise DFPlayerError('DFPlayer error %d: %s' % (p, ERRORS.get(p, 'unknown')))
        raise DFPlayerError('DFPlayer: no reply to 0x%02X (check TX/RX wiring, power, and the SD card)' % cmd)

    def wait_ready(self, timeout_ms=3000):
        """After power-on the module needs 0.5-1.5 s and then sends 0x3F with the online devices
        (1 = USB, 2 = SD, 4 = PC). Returns that bitmask, or None if nothing arrived."""
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            r = self.read_frame(time.ticks_diff(deadline, time.ticks_ms()))
            if r and r[0] == 0x3F:
                return r[1]
        return None

    # ---- control commands (3.3.1) --------------------------------------------------------
    def next(self):
        self.send(0x01)

    def previous(self):
        self.send(0x02)

    def play(self, track=None):
        """play(n): play track n (1-3000) in the root, in the order files were copied to the card.
        play(): resume."""
        if track is None:
            self.send(0x0D)
        else:
            self.send(0x03, track)

    def play_folder(self, folder, track):
        """Play track 1-255 (e.g. 001.mp3) in folder 1-99 (e.g. 01/)."""
        self.send(0x0F, (folder << 8) | track)

    def play_mp3_folder(self, track):
        """Play track 1-3000 (e.g. 0001.mp3) in the folder named MP3."""
        self.send(0x12, track)

    def pause(self):
        self.send(0x0E)

    def stop(self):
        self.send(0x16)

    def set_volume(self, level):
        """Volume 0-30."""
        self.send(0x06, max(0, min(30, level)))

    def volume_up(self):
        self.send(0x04)

    def volume_down(self):
        self.send(0x05)

    def set_eq(self, eq):
        """0 Normal, 1 Pop, 2 Rock, 3 Jazz, 4 Classic, 5 Bass."""
        self.send(0x07, eq)

    def loop_track(self, track):
        self.send(0x08, track)

    def select_device(self, device=DEVICE_SD):
        self.send(0x09, device)
        time.sleep_ms(200)

    def sleep(self):
        self.send(0x0A)

    def reset(self):
        """Software reset; the module re-initialises (wait_ready() afterwards)."""
        self.send(0x0C)

    # ---- query commands (3.3.2) ----------------------------------------------------------
    def status(self):
        """Returns (device, state): device 1 USB / 2 SD / 0x10 sleeping; state 0 stopped, 1 playing, 2 paused."""
        p = self.query(0x42)
        return p >> 8, p & 0xFF

    def volume(self):
        return self.query(0x43)

    def eq(self):
        return self.query(0x44)

    def sd_track_count(self):
        """Number of tracks in the root of the micro SD card."""
        return self.query(0x48)

    def usb_track_count(self):
        return self.query(0x47)

    def current_sd_track(self):
        """Track being played on the SD card (physical copy order)."""
        return self.query(0x4C)

    def folder_track_count(self, folder):
        return self.query(0x4E, folder)

    def folder_count(self):
        return self.query(0x4F)
