---
name: part-sh1107-1-3in-64x128
description: Pinout, electrical limits, wiring and MicroPython driver for the Waveshare 1.3inch OLED Module (C), a 64×128 monochrome OLED with a Sino Wealth SH1107 controller on 4-wire SPI (I2C optional). Use when designing, wiring, simulating or writing code for an SH1107 1.3" 64x128 OLED in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SH1107 1.3" 64×128 OLED module (Waveshare 1.3inch OLED Module (C))

## Overview
The **SH1107** from Sino Wealth is an OLED controller with a 128×128 RAM. On the **Waveshare 1.3inch OLED Module (C)** (SKU 18179) it drives a 64×128 glass that Waveshare's code uses as a 128 wide × 64 tall picture. The module ships in **4-wire SPI** mode (a resistor on the back switches it to I2C), has a TPS61040 boost converter for the 9 V panel supply, and **no regulator**: VCC goes straight to the SH1107 logic supply.

## Pinout (Waveshare 1.3" OLED (C), header order)
| Pin | Function |
|---|---|
| VCC | Supply 3.3 V (SH1107 VDD, max 3.5 V) |
| GND | Ground |
| DIN | SPI MOSI (SDA in I2C mode), 4.7 k pull-up on the module |
| CLK | SPI clock (SCL in I2C mode), 4.7 k pull-up on the module |
| CS | Chip select, active low |
| DC | Data/command: low = command, high = data (I2C address select in I2C mode) |
| RST | Reset, active low |

The PH2.0 cable connector carries the same seven signals.

## Electrical limits
- Supply: 3.3 V (SH1107 VDD 1.65–3.5 V). **Never 5 V** – there is no regulator.
- All signals are 3.3 V logic. Current: roughly 10–25 mA depending on how many pixels are lit.
- SPI: at most 4 MHz (tSCYC ≥ 250 ns at VDD 2.4–3.5 V), data latched on the rising clock edge (Waveshare uses mode 3).
- Reset: RST low ≥ 10 µs.

## Interface details
- DC low = command bytes, DC high = display RAM data; CS must be low during the transfer.
- RAM: 16 pages × 128 columns. A byte's bit n in page p drives SEG 8p+n (picture x); the column address picks the COM line (picture row).
- Init (Waveshare driver): AE, 00, 10, B0, DC 00, 81 6F, 21 (vertical addressing), A0, C0, A4, A6, A8 3F (64 lines), **D3 60** (the glass starts at COM 0x60), D5 80, D9 1D, DB 35, AD 80 (internal DC-DC off – the module has its own boost), clear RAM, AF, wait 100 ms.
- Drawing: B0, then for each picture row y = 0…63 set column 63 − y (00+low nibble, 10+high nibble) and send 16 bytes; bit 0 of each byte is the leftmost pixel (framebuf MONO_HMSB).
- I2C mode (after moving the IM resistor): address 0x3C with DC low, 0x3D with DC high; control byte 0x00 before commands, 0x40 before data.

## Wiring
- ESP32: VCC → 3V3, GND → GND, DIN → GPIO23, CLK → GPIO18, CS → GPIO5, DC → GPIO25, RST → GPIO26.
- Pico: VCC → 3V3(OUT), GND → GND, DIN → GP11, CLK → GP10, CS → GP9, DC → GP2, RST → GP3 (SPI1).
- Raspberry Pi: VCC → pin 1, GND → pin 6, DIN → pin 19, CLK → pin 23, CS → pin 24 (CE0), DC → pin 22, RST → pin 13.

## Using the driver
```python
from machine import Pin, SPI
from sh1107_spi import SH1107_SPI
spi = SPI(1, baudrate=4000000, polarity=1, phase=1, sck=Pin(18), mosi=Pin(23))
oled = SH1107_SPI(spi, dc=Pin(25), rst=Pin(26), cs=Pin(5))
oled.text('Hello', 0, 0)
oled.show()
```
`SH1107_SPI` is a 128×64 `framebuf.FrameBuffer`, so `text`, `pixel`, `line`, `rect`, `fill_rect` work; call `show()` to send the picture. Also `contrast(0–255)`, `invert(True/False)`, `poweroff()`, `poweron()`.

## Gotchas
- Blank screen or garbage with SSD1306/SH1106 code: the SH1107 command set and RAM layout differ. Use this driver.
- Nothing shows: check you did not feed 5 V (it kills the controller), and that the module is still in SPI mode (IM resistor on the SPI side).
- Picture in the wrong place or mirrored: the display offset must be 0x60 and rows go to column 63 − y.
- OLEDs burn in; blank or power off the screen when idle.

## Datasheet
https://files.waveshare.com/upload/5/58/SH1107Datasheet.pdf
