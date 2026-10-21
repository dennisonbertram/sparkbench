# Winsen MH-Z19C NDIR CO2 sensor, MicroPython driver (UART, 9600 8N1).
# Written from the Winsen MH-Z19C user's manual v1.2 (2021-05-14).
# Frames are 9 bytes: 0xFF, reserved (0x01) / command echo, data bytes, checksum.
# Checksum = (0xFF - (byte1 + ... + byte7)) + 1, low 8 bits.
import time


def _checksum(frame):
    return (0xFF - (sum(frame[1:8]) & 0xFF) + 1) & 0xFF


class MHZ19C:
    def __init__(self, uart, timeout_ms=200):
        """uart: machine.UART at 9600 baud, 8N1, wired MCU TX -> sensor RXD, MCU RX <- sensor TXD."""
        self.uart = uart
        self.timeout_ms = timeout_ms

    def _send(self, cmd, b3=0):
        f = bytearray([0xFF, 0x01, cmd, b3, 0, 0, 0, 0, 0])
        f[8] = _checksum(f)
        self.uart.write(f)

    def _drain(self):
        while self.uart.any():
            self.uart.read()

    def read_co2(self):
        """Command 0x86: return the CO2 concentration in ppm (HIGH * 256 + LOW)."""
        self._drain()
        self._send(0x86)
        buf = b''
        t0 = time.ticks_ms()
        while len(buf) < 9 and time.ticks_diff(time.ticks_ms(), t0) < self.timeout_ms:
            if self.uart.any():
                buf += self.uart.read(9 - len(buf))
            else:
                time.sleep_ms(5)
        if len(buf) < 9:
            raise OSError('MH-Z19C: no reply (check TX/RX are crossed and Vin is 5 V)')
        if buf[0] != 0xFF or buf[1] != 0x86:
            raise OSError('MH-Z19C: bad frame start')
        if _checksum(buf) != buf[8]:
            raise OSError('MH-Z19C: checksum mismatch')
        return buf[2] * 256 + buf[3]

    def set_abc(self, on):
        """Command 0x79 (no reply): automatic zero-point self-calibration on (0xA0) or off (0x00).
        Factory default is on; turn it off in greenhouses, farms or rooms that never see fresh air."""
        self._send(0x79, 0xA0 if on else 0x00)


def zero_calibrate_hd(hd_pin):
    """Manual zero-point (400 ppm) calibration through the HD pin: hold it low for at least 7 s.
    hd_pin: machine.Pin wired to HD. Only after >= 20 min (30 min recommended) in stable 400 ppm fresh air."""
    hd_pin.init(hd_pin.OUT, value=0)
    time.sleep(8)
    hd_pin.init(hd_pin.IN)
