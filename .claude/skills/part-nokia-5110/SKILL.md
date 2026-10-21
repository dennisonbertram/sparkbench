---
name: part-nokia-5110
description: Pinout, electrical limits, wiring and MicroPython driver for the Nokia 5110 84x48 monochrome graphic LCD module (Philips PCD8544 controller, SPI). Use when designing, wiring, simulating or writing code for a Nokia 5110 / Nokia 3310 / PCD8544 LCD in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Nokia 5110 84x48 LCD (PCD8544)

## Overview
The **Nokia 5110 LCD** is the 84×48-pixel monochrome screen from the old Nokia phones. A **Philips PCD8544** controller drives it and generates the LCD voltages on-chip. You write to it over a write-only SPI-style bus with a data/command (DC) pin. This part is modelled on the common **blue "Nokia5110 3v-5v" clone module**: an 8-pin 2.54 mm header with four backlight LEDs. The red clone has the same pin order, with BL printed LIGHT.

## Pinout (blue clone module, header order, left to right)
| Pin | Function |
|---|---|
| RST | Reset, active low (pulse it once after power-up) |
| CE | Chip enable (SCE), active low |
| DC | Data/command: low = command, high = display data |
| DIN | Serial data in (SPI MOSI) |
| CLK | Serial clock (SPI SCK), 4 MHz max |
| VCC | Supply, 2.7–3.3 V: use 3.3 V |
| BL | Backlight LEDs (optional): 3.3 V max, ideally through 330 Ω; PWM to dim |
| GND | Ground |

## Electrical limits
- PCD8544 logic supply VDD **2.7–3.3 V**. Inputs must stay between −0.5 V and VDD + 0.5 V. The board is often printed "3v-5v", but it has no regulator or level shifter, so use 3.3 V power and 3.3 V logic. ESP32 and Pico GPIOs are correct as they are.
- Current: about 6–7 mA for the LCD (0.3 mA for the chip itself), plus the backlight. Unlimited at 3.3 V, the four LEDs can draw about 100 mA, so use a series resistor.
- Serial clock up to 4 MHz (250 ns cycle); RES low pulse ≥ 100 ns.

## Interface details
- SPI mode 0 (data sampled on the rising SCLK edge), MSB first, no MISO. CE low for a transfer; DC is sampled on the 8th bit of each byte.
- Two instruction sets, chosen by bit H of Function set **0x20 | PD<<2 | V<<1 | H**:
  - H = 1 (extended): Temperature coefficient **0x04–0x07**, Bias **0x10–0x17** (0x13 = 1:48 mux, the datasheet's recommended n = 4), Set VOP **0x80 | VOP**.
  - H = 0 (basic): Display control **0x08** blank / **0x0C** normal / **0x09** all on / **0x0D** inverse, Set Y (bank) **0x40 | 0..5**, Set X (column) **0x80 | 0..83**.
- Init (datasheet, section 8 and Table 6): RST pulse, then 0x21, 0x04, 0x13, 0x80 | VOP, 0x20, 0x0C, then clear the RAM, which is undefined at power-on.
- Contrast: VLCD = 3.06 + 0.06 × VOP volts. Keep VOP ≤ 90 (VLCD ≤ 8.5 V); 0x30–0x45 suits most modules.
- RAM: 6 banks × 84 bytes. Each byte is a vertical strip of 8 pixels with the LSB on top, which matches MicroPython's `framebuf.MONO_VLSB`. With horizontal addressing (V = 0), writing 504 bytes from X = 0, Y = 0 fills the whole screen.

## Wiring
- ESP32: VCC → 3V3, GND → GND, CLK → D18, DIN → D23, CE → D5, DC → D26, RST → D25, BL → 3V3 through 330 Ω (optional).
- Pico: VCC → 3V3(OUT), GND → GND, CLK → GP18, DIN → GP19, CE → GP17, DC → GP3, RST → GP2 (SPI0).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CE → pin 24 (CE0), DC → pin 22, RST → pin 18.

## Using the driver
```python
from machine import Pin, SPI
from pcd8544 import PCD8544
spi = SPI(2, baudrate=2000000, sck=Pin(18), mosi=Pin(23))   # Pico: SPI(0, ..., sck=Pin(18), mosi=Pin(19))
lcd = PCD8544(spi, cs=5, dc=26, rst=25)                      # contrast=0x3F by default
lcd.fill(0)
lcd.text('Hello', 0, 0, 1)        # 1 = dark pixel; 6 lines of 10 characters fit
lcd.rect(0, 20, 40, 20, 1)
lcd.show()
```

## Gotchas
- Blank screen: check the RST pulse and DC wiring, then try another contrast (`lcd.contrast(0x38)` to `0x48`). Panels vary a lot.
- An all-dark screen means the contrast (VOP) is too high. Lower it, and never exceed about 90.
- Do not feed 5 V to VCC, the data pins or BL, whatever the silkscreen says.
- The backlight on some red clones lights when LIGHT is pulled low (the LEDs are tied to VCC on the board). If it does not light when driven high, try tying it to GND.
- `power_off()` clears the RAM first, as the datasheet requires for low standby current.

## Datasheet
https://www.sparkfun.com/datasheets/LCD/Monochrome/Nokia5110.pdf
