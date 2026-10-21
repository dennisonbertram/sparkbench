---
name: part-max7219-4-in-1-matrix
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX7219 4-in-1 32x8 LED dot matrix module (FC-16 type, four daisy-chained MAX7219s). Use when designing, wiring, simulating or writing code for a 4-in-1 MAX7219 matrix / scrolling text display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX7219 4-in-1 32x8 LED dot matrix (MAX7219 x4)

## Overview
The **MAX7219** from Maxim (now Analog Devices) drives 64 LEDs as 8 multiplexed "digits" with 16-step brightness. The **FC-16 type 4-in-1 module** puts four 8x8 red matrices on one 128x32 mm board, each with its own MAX7219, cascaded DOUT → DIN, giving a 32x8 pixel strip. It is written over a write-only 3-wire serial bus (SPI mode 0, up to 10 MHz).

## Pinout (FC-16 4-in-1 module, input header order)
| Pin | Function |
|---|---|
| VCC | Supply, 4.0–5.5 V (use 5 V) |
| GND | Ground |
| DIN | Serial data in (MOSI), enters the rightmost block |
| CS | LOAD / chip select for all four chips: rising edge latches |
| CLK | Serial clock (SCK), up to 10 MHz |

The output header on the opposite (left) edge is VCC, GND, DOUT, CS, CLK, for chaining another module. Because the board has headers on two edges it is wired with female jumper leads.

## Electrical limits
- Supply: 4.0–5.5 V (datasheet operating range). Not reliable at 3.3 V.
- Current: datasheet 330 mA per chip with all segments on at 40 mA, so up to about 1.3 A for the module; 150 µA per chip in shutdown. Use a separate 5 V ≥1.5 A supply with common GND, or keep brightness 0–3 and sparse content on USB 5 V.
- Logic inputs: VIH 3.5 V min, VIL 0.8 V max at 5 V. 3.3 V GPIO usually works; a 74HCT125 buffer makes it certain.
- Serial timing: CLK period ≥ 100 ns, data setup 25 ns.

## Interface details
- 16-bit frames, MSB first: D15–D8 address (D11–D8 used), D7–D0 data, sampled on CLK rising edge, latched on LOAD (CS) rising edge.
- Registers: 0x01–0x08 rows 0–7, 0x09 decode mode, 0x0A intensity (0–15 = 1/32…31/32 duty), 0x0B scan limit, 0x0C shutdown, 0x0F display test, 0x00 no-op.
- Cascade: send 4 frames (8 bytes) per CS-low burst. The first frame sent ends up in the last chip, which is the LEFTMOST block on FC-16; the last frame goes to the rightmost block (nearest DIN).
- Orientation (FC-16): register 0x01 is the top row, bit 7 the left column of each block.
- Power-up: shutdown, scan limit 0, no decode, minimum intensity. Initialise display test 0, scan limit 7, decode 0, intensity, clear, then shutdown = 1.

## Wiring
- ESP32: VCC → external 5 V (or VIN for low brightness), GND → GND, DIN → D23, CLK → D18, CS → D5.
- Pico: VCC → external 5 V (or VBUS), GND → GND, DIN → GP11, CLK → GP10, CS → GP13 (SPI1).
- Raspberry Pi 4: VCC → external 5 V (or pin 2), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CS → pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from max7219 import Matrix
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
d = Matrix(spi, 5, 4)        # CS on GPIO5, 4 chained blocks
d.text('AB12', 0, 0, 1)      # framebuf: 8x8 font, 4 characters fit
d.show()
d.brightness(2)              # 0..15
# scrolling: d.fill(0); d.text(msg, x, 0, 1); d.show() with x decreasing
```

## Gotchas
- Nothing lights: VCC must be 5 V, and the chips must leave shutdown (0x0C = 1); they power up dark.
- Only one row lights: scan limit left at power-up value; set 0x0B = 7 on all four chips.
- Text appears in the wrong block order or mirrored: generic (non FC-16) 4-in-1 boards rotate each matrix 90°; this driver is for FC-16.
- Board resets or display flickers at high brightness: 1.3 A peak is more than a USB 5 V pin gives; use a separate supply or lower brightness, and add 10 µF + 0.1 µF at VCC.
- Wired to the DOUT edge: nothing happens; use the DIN header.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf
