// Device driver files shipped with generated projects. These are copied onto the real
// board next to main.py, and they're also what runs inside the simulator.

export const SSD1306_PY = `# MicroPython SSD1306 OLED driver, I2C interface (micropython-lib, MIT licence)
from micropython import const
import framebuf

SET_CONTRAST = const(0x81)
SET_ENTIRE_ON = const(0xA4)
SET_NORM_INV = const(0xA6)
SET_DISP = const(0xAE)
SET_MEM_ADDR = const(0x20)
SET_COL_ADDR = const(0x21)
SET_PAGE_ADDR = const(0x22)
SET_DISP_START_LINE = const(0x40)
SET_SEG_REMAP = const(0xA0)
SET_MUX_RATIO = const(0xA8)
SET_IREF_SELECT = const(0xAD)
SET_COM_OUT_DIR = const(0xC0)
SET_DISP_OFFSET = const(0xD3)
SET_COM_PIN_CFG = const(0xDA)
SET_DISP_CLK_DIV = const(0xD5)
SET_PRECHARGE = const(0xD9)
SET_VCOM_DESEL = const(0xDB)
SET_CHARGE_PUMP = const(0x8D)


class SSD1306(framebuf.FrameBuffer):
    def __init__(self, width, height, external_vcc):
        self.width = width
        self.height = height
        self.external_vcc = external_vcc
        self.pages = self.height // 8
        self.buffer = bytearray(self.pages * self.width)
        super().__init__(self.buffer, self.width, self.height, framebuf.MONO_VLSB)
        self.init_display()

    def init_display(self):
        for cmd in (
            SET_DISP,
            SET_MEM_ADDR, 0x00,
            SET_DISP_START_LINE,
            SET_SEG_REMAP | 0x01,
            SET_MUX_RATIO, self.height - 1,
            SET_COM_OUT_DIR | 0x08,
            SET_DISP_OFFSET, 0x00,
            SET_COM_PIN_CFG, 0x02 if self.width > 2 * self.height else 0x12,
            SET_DISP_CLK_DIV, 0x80,
            SET_PRECHARGE, 0x22 if self.external_vcc else 0xF1,
            SET_VCOM_DESEL, 0x30,
            SET_CONTRAST, 0xFF,
            SET_ENTIRE_ON,
            SET_NORM_INV,
            SET_IREF_SELECT, 0x30,
            SET_CHARGE_PUMP, 0x10 if self.external_vcc else 0x14,
            SET_DISP | 0x01,
        ):
            self.write_cmd(cmd)
        self.fill(0)
        self.show()

    def poweroff(self):
        self.write_cmd(SET_DISP)

    def poweron(self):
        self.write_cmd(SET_DISP | 0x01)

    def contrast(self, contrast):
        self.write_cmd(SET_CONTRAST)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(SET_NORM_INV | (invert & 1))

    def show(self):
        self.write_cmd(SET_COL_ADDR)
        self.write_cmd(0)
        self.write_cmd(self.width - 1)
        self.write_cmd(SET_PAGE_ADDR)
        self.write_cmd(0)
        self.write_cmd(self.pages - 1)
        self.write_data(self.buffer)


class SSD1306_I2C(SSD1306):
    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self.i2c = i2c
        self.addr = addr
        self.temp = bytearray(2)
        self.write_list = [b"\\x40", None]  # Co=0, D/C#=1
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self.temp[0] = 0x80  # Co=1, D/C#=0
        self.temp[1] = cmd
        self.i2c.writeto(self.addr, self.temp)

    def write_data(self, buf):
        self.write_list[1] = buf
        self.i2c.writevto(self.addr, self.write_list)
`;

export const MPU6050_PY = `# Minimal MPU-6050 accelerometer/gyro driver for MicroPython (I2C)
ACCEL_XOUT_H = 0x3B
GYRO_XOUT_H = 0x43
TEMP_OUT_H = 0x41
PWR_MGMT_1 = 0x6B
WHO_AM_I = 0x75


def _signed(hi, lo):
    v = (hi << 8) | lo
    return v - 0x10000 if v & 0x8000 else v


class MPU6050:
    def __init__(self, i2c, addr=0x68):
        self.i2c = i2c
        self.addr = addr
        if self.i2c.readfrom_mem(addr, WHO_AM_I, 1)[0] != 0x68:
            raise OSError("MPU6050 not found at 0x%02x" % addr)
        self.i2c.writeto_mem(addr, PWR_MGMT_1, b"\\x00")  # wake up

    def _xyz(self, reg):
        d = self.i2c.readfrom_mem(self.addr, reg, 6)
        return _signed(d[0], d[1]), _signed(d[2], d[3]), _signed(d[4], d[5])

    def accel(self):
        """Acceleration in g (1 g = 9.81 m/s^2), default ±2 g range."""
        x, y, z = self._xyz(ACCEL_XOUT_H)
        return x / 16384, y / 16384, z / 16384

    def gyro(self):
        """Rotation rate in degrees per second, default ±250 °/s range."""
        x, y, z = self._xyz(GYRO_XOUT_H)
        return x / 131, y / 131, z / 131

    def temperature(self):
        d = self.i2c.readfrom_mem(self.addr, TEMP_OUT_H, 2)
        return _signed(d[0], d[1]) / 340 + 36.53
`;

export const I2C_LCD_PY = `# HD44780 16x2 LCD over a PCF8574 I2C backpack (MicroPython)
import time

# PCF8574 bit layout on the common backpack
RS = 0x01
EN = 0x04
BACKLIGHT = 0x08


class I2cLcd:
    def __init__(self, i2c, addr=0x27, rows=2, cols=16):
        self.i2c = i2c
        self.addr = addr
        self.rows = rows
        self.cols = cols
        self.bl = BACKLIGHT
        self.i2c.writeto(self.addr, bytes([0]))
        time.sleep_ms(20)
        for _ in range(3):  # reset sequence: three times "8-bit mode"
            self._nibble(0x30)
            time.sleep_ms(5)
        self._nibble(0x20)  # switch to 4-bit mode
        self.command(0x28)  # 4-bit, 2 lines, 5x8 font
        self.command(0x0C)  # display on, cursor off
        self.command(0x06)  # entry mode: increment
        self.clear()

    def _write(self, b):
        self.i2c.writeto(self.addr, bytes([b | self.bl]))

    def _nibble(self, data, rs=0):
        b = (data & 0xF0) | rs
        self._write(b | EN)
        self._write(b)

    def command(self, cmd):
        self._nibble(cmd & 0xF0)
        self._nibble((cmd << 4) & 0xF0)
        if cmd <= 3:
            time.sleep_ms(2)

    def write_char(self, ch):
        self._nibble(ch & 0xF0, RS)
        self._nibble((ch << 4) & 0xF0, RS)

    def clear(self):
        self.command(0x01)
        self.move_to(0, 0)

    def move_to(self, col, row):
        self.command(0x80 | (col + (0x40 if row else 0)))

    def putstr(self, text):
        for ch in text:
            self.write_char(ord(ch) if ord(ch) < 256 else 0x3F)

    def backlight_on(self):
        self.bl = BACKLIGHT
        self._write(0)

    def backlight_off(self):
        self.bl = 0
        self._write(0)
`;

// ------------------------------------------------------------------ Raspberry Pi (CPython) drivers

/** 5x7 ASCII font (0x20–0x7E), 5 column bytes per glyph, LSB = top row. */
export const FONT5X7 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5f, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x14, 0x7f, 0x14, 0x7f, 0x14, 0x24, 0x2a, 0x7f, 0x2a, 0x12, 0x23, 0x13, 0x08, 0x64, 0x62,
  0x36, 0x49, 0x55, 0x22, 0x50, 0x00, 0x05, 0x03, 0x00, 0x00, 0x00, 0x1c, 0x22, 0x41, 0x00, 0x00, 0x41, 0x22, 0x1c, 0x00, 0x08, 0x2a, 0x1c, 0x2a, 0x08, 0x08, 0x08, 0x3e, 0x08, 0x08,
  0x00, 0x50, 0x30, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x60, 0x60, 0x00, 0x00, 0x20, 0x10, 0x08, 0x04, 0x02, 0x3e, 0x51, 0x49, 0x45, 0x3e, 0x00, 0x42, 0x7f, 0x40, 0x00,
  0x42, 0x61, 0x51, 0x49, 0x46, 0x21, 0x41, 0x45, 0x4b, 0x31, 0x18, 0x14, 0x12, 0x7f, 0x10, 0x27, 0x45, 0x45, 0x45, 0x39, 0x3c, 0x4a, 0x49, 0x49, 0x30, 0x01, 0x71, 0x09, 0x05, 0x03,
  0x36, 0x49, 0x49, 0x49, 0x36, 0x06, 0x49, 0x49, 0x29, 0x1e, 0x00, 0x36, 0x36, 0x00, 0x00, 0x00, 0x56, 0x36, 0x00, 0x00, 0x08, 0x14, 0x22, 0x41, 0x00, 0x14, 0x14, 0x14, 0x14, 0x14,
  0x00, 0x41, 0x22, 0x14, 0x08, 0x02, 0x01, 0x51, 0x09, 0x06, 0x32, 0x49, 0x79, 0x41, 0x3e, 0x7e, 0x11, 0x11, 0x11, 0x7e, 0x7f, 0x49, 0x49, 0x49, 0x36, 0x3e, 0x41, 0x41, 0x41, 0x22,
  0x7f, 0x41, 0x41, 0x22, 0x1c, 0x7f, 0x49, 0x49, 0x49, 0x41, 0x7f, 0x09, 0x09, 0x09, 0x01, 0x3e, 0x41, 0x49, 0x49, 0x7a, 0x7f, 0x08, 0x08, 0x08, 0x7f, 0x00, 0x41, 0x7f, 0x41, 0x00,
  0x20, 0x40, 0x41, 0x3f, 0x01, 0x7f, 0x08, 0x14, 0x22, 0x41, 0x7f, 0x40, 0x40, 0x40, 0x40, 0x7f, 0x02, 0x0c, 0x02, 0x7f, 0x7f, 0x04, 0x08, 0x10, 0x7f, 0x3e, 0x41, 0x41, 0x41, 0x3e,
  0x7f, 0x09, 0x09, 0x09, 0x06, 0x3e, 0x41, 0x51, 0x21, 0x5e, 0x7f, 0x09, 0x19, 0x29, 0x46, 0x46, 0x49, 0x49, 0x49, 0x31, 0x01, 0x01, 0x7f, 0x01, 0x01, 0x3f, 0x40, 0x40, 0x40, 0x3f,
  0x1f, 0x20, 0x40, 0x20, 0x1f, 0x3f, 0x40, 0x38, 0x40, 0x3f, 0x63, 0x14, 0x08, 0x14, 0x63, 0x07, 0x08, 0x70, 0x08, 0x07, 0x61, 0x51, 0x49, 0x45, 0x43, 0x00, 0x7f, 0x41, 0x41, 0x00,
  0x02, 0x04, 0x08, 0x10, 0x20, 0x00, 0x41, 0x41, 0x7f, 0x00, 0x04, 0x02, 0x01, 0x02, 0x04, 0x40, 0x40, 0x40, 0x40, 0x40, 0x00, 0x01, 0x02, 0x04, 0x00, 0x20, 0x54, 0x54, 0x54, 0x78,
  0x7f, 0x48, 0x44, 0x44, 0x38, 0x38, 0x44, 0x44, 0x44, 0x20, 0x38, 0x44, 0x44, 0x48, 0x7f, 0x38, 0x54, 0x54, 0x54, 0x18, 0x08, 0x7e, 0x09, 0x01, 0x02, 0x0c, 0x52, 0x52, 0x52, 0x3e,
  0x7f, 0x08, 0x04, 0x04, 0x78, 0x00, 0x44, 0x7d, 0x40, 0x00, 0x20, 0x40, 0x44, 0x3d, 0x00, 0x7f, 0x10, 0x28, 0x44, 0x00, 0x00, 0x41, 0x7f, 0x40, 0x00, 0x7c, 0x04, 0x18, 0x04, 0x78,
  0x7c, 0x08, 0x04, 0x04, 0x78, 0x38, 0x44, 0x44, 0x44, 0x38, 0x7c, 0x14, 0x14, 0x14, 0x08, 0x08, 0x14, 0x14, 0x18, 0x7c, 0x7c, 0x08, 0x04, 0x04, 0x08, 0x48, 0x54, 0x54, 0x54, 0x20,
  0x04, 0x3f, 0x44, 0x40, 0x20, 0x3c, 0x40, 0x40, 0x20, 0x7c, 0x1c, 0x20, 0x40, 0x20, 0x1c, 0x3c, 0x40, 0x30, 0x40, 0x3c, 0x44, 0x28, 0x10, 0x28, 0x44, 0x0c, 0x50, 0x50, 0x50, 0x3c,
  0x44, 0x64, 0x54, 0x4c, 0x44, 0x00, 0x08, 0x36, 0x41, 0x00, 0x00, 0x00, 0x7f, 0x00, 0x00, 0x00, 0x41, 0x36, 0x08, 0x00, 0x08, 0x04, 0x08, 0x10, 0x08,
];

export const OLED_PI_PY = `# SSD1306 128x64 I2C OLED driver for Raspberry Pi (pure Python + smbus2).
# Same drawing API as MicroPython's framebuf: fill, pixel, text, hline, vline, rect, fill_rect, line, show.
from smbus2 import SMBus, i2c_msg

FONT = bytes([${FONT5X7.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ')}])


class OLED:
    def __init__(self, bus=1, addr=0x3C, width=128, height=64):
        self.bus = SMBus(bus)
        self.addr = addr
        self.width = width
        self.height = height
        self.buffer = bytearray(width * height // 8)
        for cmd in (0xAE, 0x20, 0x00, 0x40, 0xA1, 0xA8, height - 1, 0xC8, 0xD3, 0x00, 0xDA, 0x12,
                    0xD5, 0x80, 0xD9, 0xF1, 0xDB, 0x30, 0x81, 0xFF, 0xA4, 0xA6, 0x8D, 0x14, 0xAF):
            self.bus.write_byte_data(self.addr, 0x80, cmd)
        self.fill(0)
        self.show()

    def show(self):
        for cmd in (0x21, 0, self.width - 1, 0x22, 0, self.height // 8 - 1):
            self.bus.write_byte_data(self.addr, 0x80, cmd)
        self.bus.i2c_rdwr(i2c_msg.write(self.addr, b"\\x40" + bytes(self.buffer)))

    def fill(self, c):
        v = 0xFF if c else 0
        for i in range(len(self.buffer)):
            self.buffer[i] = v

    def pixel(self, x, y, c=1):
        if 0 <= x < self.width and 0 <= y < self.height:
            i = x + (y // 8) * self.width
            if c:
                self.buffer[i] |= 1 << (y & 7)
            else:
                self.buffer[i] &= ~(1 << (y & 7)) & 0xFF

    def hline(self, x, y, w, c=1):
        for i in range(w):
            self.pixel(x + i, y, c)

    def vline(self, x, y, h, c=1):
        for i in range(h):
            self.pixel(x, y + i, c)

    def rect(self, x, y, w, h, c=1):
        self.hline(x, y, w, c)
        self.hline(x, y + h - 1, w, c)
        self.vline(x, y, h, c)
        self.vline(x + w - 1, y, h, c)

    def fill_rect(self, x, y, w, h, c=1):
        for j in range(h):
            self.hline(x, y + j, w, c)

    def line(self, x0, y0, x1, y1, c=1):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.pixel(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def text(self, s, x, y, c=1):
        for ch in s:
            code = ord(ch)
            if code < 32 or code > 126:
                code = 63
            base = (code - 32) * 5
            for col in range(5):
                bits = FONT[base + col]
                for row in range(8):
                    if bits & (1 << row):
                        self.pixel(x + col, y + row, c)
            x += 8
`;

export const MPU6050_PI_PY = `# MPU-6050 accelerometer/gyro driver for Raspberry Pi (smbus2)
from smbus2 import SMBus


def _signed(hi, lo):
    v = (hi << 8) | lo
    return v - 0x10000 if v & 0x8000 else v


class MPU6050:
    def __init__(self, bus=1, addr=0x68):
        self.bus = SMBus(bus)
        self.addr = addr
        if self.bus.read_byte_data(addr, 0x75) != 0x68:
            raise OSError("MPU6050 not found at 0x%02x" % addr)
        self.bus.write_byte_data(addr, 0x6B, 0)  # wake up

    def _xyz(self, reg):
        d = self.bus.read_i2c_block_data(self.addr, reg, 6)
        return _signed(d[0], d[1]), _signed(d[2], d[3]), _signed(d[4], d[5])

    def accel(self):
        x, y, z = self._xyz(0x3B)
        return x / 16384, y / 16384, z / 16384

    def gyro(self):
        x, y, z = self._xyz(0x43)
        return x / 131, y / 131, z / 131
`;

export const LCD_PI_PY = `# HD44780 16x2 LCD over a PCF8574 I2C backpack, Raspberry Pi (smbus2)
import time
from smbus2 import SMBus

RS = 0x01
EN = 0x04
BACKLIGHT = 0x08


class I2cLcd:
    def __init__(self, bus=1, addr=0x27, rows=2, cols=16):
        self.bus = SMBus(bus)
        self.addr = addr
        self.rows = rows
        self.cols = cols
        self.bl = BACKLIGHT
        self.bus.write_byte(self.addr, 0)
        time.sleep(0.02)
        for _ in range(3):
            self._nibble(0x30)
            time.sleep(0.005)
        self._nibble(0x20)
        self.command(0x28)
        self.command(0x0C)
        self.command(0x06)
        self.clear()

    def _write(self, b):
        self.bus.write_byte(self.addr, b | self.bl)

    def _nibble(self, data, rs=0):
        b = (data & 0xF0) | rs
        self._write(b | EN)
        self._write(b)

    def command(self, cmd):
        self._nibble(cmd & 0xF0)
        self._nibble((cmd << 4) & 0xF0)
        if cmd <= 3:
            time.sleep(0.002)

    def write_char(self, ch):
        self._nibble(ch & 0xF0, RS)
        self._nibble((ch << 4) & 0xF0, RS)

    def clear(self):
        self.command(0x01)
        self.move_to(0, 0)

    def move_to(self, col, row):
        self.command(0x80 | (col + (0x40 if row else 0)))

    def putstr(self, text):
        for ch in text:
            self.write_char(ord(ch) if ord(ch) < 256 else 0x3F)
`;
