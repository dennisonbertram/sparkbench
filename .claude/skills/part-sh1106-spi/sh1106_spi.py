# SH1106 132x64 OLED controller (Sino Wealth), MicroPython 4-wire SPI driver for 1.3" 128x64 modules
# (e.g. Pololu #3761 / #3760: GND, VCC, CLK, MOS, RES, DC, CS).
# From the SH1106 datasheet V2.3:
#   4-wire SPI: SI is shifted in on every RISING edge of SCL, MSB (D7) first -> SPI mode 0 (polarity 0, phase 0).
#   A0 (the module's DC pin) is sampled on every 8th clock: low = command byte, high = display RAM data.
#   A falling edge on CS starts a transfer; CS high resets the serial interface.
#   Serial clock cycle tSCYC >= 250 ns at VDD1 2.4-3.5 V -> at most 4 MHz.
#   Reset: RES low pulse tRW >= 10 ms (worst case, VDD1 1.65 V), reset time tR <= 2 ms.
#   Power on: reset, initial setup, clear RAM, display on (AFh), wait 100 ms, then send display data.
#   132 RAM columns; 1.3" 128-pixel panels show columns 2..129, so each page is written from column 2.
#   Page addressing only (B0h-B7h page, 00h-0Fh / 10h-1Fh column): no 20h/21h/22h commands.
import time
import framebuf


class SH1106_SPI(framebuf.FrameBuffer):
    def __init__(self, width, height, spi, dc, res, cs, col_offset=2, baudrate=4000000):
        self.width = width
        self.height = height
        self.spi = spi
        self.dc = dc
        self.res = res
        self.cs = cs
        self.col_offset = col_offset
        self.rate = min(baudrate, 4000000)   # tSCYC >= 250 ns
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        dc.init(dc.OUT, value=0)
        cs.init(cs.OUT, value=1)
        if res is not None:
            res.init(res.OUT, value=1)
            time.sleep_ms(1)
            res(0)
            time.sleep_ms(10)   # tRW >= 10 ms
            res(1)
            time.sleep_ms(2)    # tR <= 2 ms before the chip accepts commands
        self.init_display()

    def _write(self, dc, buf):
        self.spi.init(baudrate=self.rate, polarity=0, phase=0)
        self.cs(1)
        self.dc(dc)
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)

    def write_cmd(self, *cmds):
        self._write(0, bytes(cmds))

    def write_data(self, buf):
        self._write(1, buf)

    def init_display(self):
        self.write_cmd(
            0xAE,              # display off (sleep)
            0xD5, 0x80,        # clock divide ratio 1, oscillator +15 % (POR)
            0xA8, self.height - 1,  # multiplex ratio
            0xD3, 0x00,        # display offset 0
            0x40,              # display start line 0
            0xAD, 0x8B,        # DC-DC control: built-in DC-DC on when display on (POR)
            0x32,              # charge pump output 8.0 V (POR)
            0xA1,              # segment re-map: column 131 -> SEG0 (module orientation)
            0xC8,              # COM scan COM[N-1] -> COM0
            0xDA, 0x12,        # common pads: alternative (POR)
            0x81, 0x80,        # contrast 128 (POR)
            0xD9, 0x22,        # discharge/precharge 2/2 DCLKs (POR)
            0xDB, 0x35,        # VCOM deselect level (POR)
            0xA4,              # display follows RAM
            0xA6,              # normal (not inverted)
        )
        # Clear all 132 RAM columns of every page before display on (power-on flow chart)
        blank = bytes(132)
        for page in range(8):
            self.write_cmd(0xB0 | page, 0x00, 0x10)
            self.write_data(blank)
        self.write_cmd(0xAF)   # display on
        time.sleep_ms(100)     # wait 100 ms after display on before sending data
        self.fill(0)
        self.show()

    def poweroff(self):
        self.write_cmd(0xAE)

    def poweron(self):
        self.write_cmd(0xAF)

    def contrast(self, value):
        self.write_cmd(0x81, value & 0xFF)

    def invert(self, on):
        self.write_cmd(0xA7 if on else 0xA6)

    def show(self):
        col = self.col_offset
        for page in range(self.pages):
            self.write_cmd(0xB0 | page, col & 0x0F, 0x10 | (col >> 4))
            start = page * self.width
            self.write_data(self.buffer[start:start + self.width])
