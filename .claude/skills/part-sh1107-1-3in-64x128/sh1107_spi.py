# SH1107 OLED controller (Sino Wealth), MicroPython driver for the Waveshare 1.3inch OLED Module (C)
# (64x128 glass shown as 128 wide x 64 tall; header VCC, GND, DIN, CLK, CS, DC, RST; 4-wire SPI as shipped).
# From the SH1107 datasheet and Waveshare's own OLED_1in3_c driver:
#   4-wire SPI: SI is shifted in on every RISING edge of SCL, MSB first; Waveshare uses mode 3 (polarity 1, phase 1).
#   A0 (the module's DC pin): low = command byte, high = display RAM data. CS low enables the interface.
#   tSCYC >= 250 ns at VDD 2.4-3.5 V -> at most 4 MHz.
#   Reset: RES low >= 10 us (tRW), reset time tR <= 2 us.
#   Power on: reset, initial setup, clear RAM, display on (AFh), wait 100 ms, then send display data.
#   128x128 RAM: 16 pages (bit n of page p -> SEG 8p+n) x 128 columns (column address -> COM line).
#   This glass uses 64 COM lines from COM 0x60 (display offset D3h 60h, multiplex A8h 3Fh) and all 128 SEG lines.
#   Vertical addressing (21h): each data byte advances the page, so one image row = 16 bytes at one column.
#   Waveshare writes image row y at column 63 - y with A0 (no segment remap) and C0 (normal COM scan): upright.
#   The module has its own 9 V boost (TPS61040) for VPP, so the internal DC-DC is switched off (ADh 80h).
import time
import framebuf


class SH1107_SPI(framebuf.FrameBuffer):
    def __init__(self, spi, dc, rst, cs, width=128, height=64, baudrate=4000000):
        self.width = width
        self.height = height
        self.spi = spi
        self.dc = dc
        self.rst = rst
        self.cs = cs
        self.rate = min(baudrate, 4000000)   # tSCYC >= 250 ns
        self.buffer = bytearray(width * height // 8)
        # One bit per pixel, rows of 16 bytes, bit 0 = leftmost pixel (Waveshare getbuffer: bit x % 8 of byte y*16 + x//8)
        super().__init__(self.buffer, width, height, framebuf.MONO_HMSB)
        dc.init(dc.OUT, value=0)
        cs.init(cs.OUT, value=1)
        if rst is not None:
            rst.init(rst.OUT, value=1)
            time.sleep_ms(10)
            rst(0)
            time.sleep_ms(10)   # tRW >= 10 us
            rst(1)
            time.sleep_ms(10)   # tR <= 2 us
        self.init_display()

    def _write(self, dc, buf):
        self.spi.init(baudrate=self.rate, polarity=1, phase=1)
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
            0xAE,              # display off
            0x00, 0x10,        # column address 0
            0xB0,              # page address 0
            0xDC, 0x00,        # display start line 0
            0x81, 0x6F,        # contrast
            0x21,              # vertical addressing mode
            0xA0,              # segment remap off (SEG0 at the left)
            0xC0,              # COM scan COM0 -> COM[N-1]
            0xA4,              # display follows RAM
            0xA6,              # normal (not inverted)
            0xA8, 0x3F,        # multiplex ratio 64
            0xD3, 0x60,        # display offset: the glass starts at COM 0x60
            0xD5, 0x80,        # oscillator / clock divide
            0xD9, 0x1D,        # pre-charge / discharge period
            0xDB, 0x35,        # VCOM deselect level
            0xAD, 0x80,        # internal DC-DC off (the module has its own VPP boost)
        )
        self.fill(0)
        self.show()            # clear RAM before display on (power-on flow chart)
        time.sleep_ms(200)
        self.write_cmd(0xAF)   # display on
        time.sleep_ms(100)     # wait 100 ms before sending display data

    def poweroff(self):
        self.write_cmd(0xAE)

    def poweron(self):
        self.write_cmd(0xAF)

    def contrast(self, value):
        self.write_cmd(0x81, value & 0xFF)

    def invert(self, on):
        self.write_cmd(0xA7 if on else 0xA6)

    def show(self):
        row_bytes = self.width // 8
        self.write_cmd(0xB0)
        for y in range(self.height):
            col = 63 - y
            self.write_cmd(col & 0x0F, 0x10 | (col >> 4))
            start = y * row_bytes
            self.write_data(self.buffer[start:start + row_bytes])
