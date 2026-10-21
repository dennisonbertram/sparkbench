---
name: part-max7219-8x8-matrix
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX7219 8x8 LED dot matrix module (FC-16 style, MAX7219). Use when designing, wiring, simulating or writing code for a MAX7219 8x8 matrix in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX7219 8x8 LED dot matrix (MAX7219)

## Overview
The **MAX7219** from Maxim (now Analog Devices) drives up to 64 LEDs, scanning 8 "digits" at about 800 Hz with a 16-step brightness control. On an **FC-16 style 8x8 dot matrix module** each digit register is one row of the red 8x8 matrix. It is written over a simple 3-wire serial bus (SPI mode 0, write-only) and modules chain DOUT → DIN.

## Pinout (FC-16 style module, input header order)
| Pin | Function |
|---|---|
| VCC | Supply, 4.0–5.5 V (use 5 V) |
| GND | Ground |
| DIN | Serial data in (MOSI) |
| CS | LOAD / chip select: rising edge latches the frame |
| CLK | Serial clock (SCK), up to 10 MHz |

The output header on the other edge is VCC, GND, DOUT, CS, CLK, for chaining the next module.

## Electrical limits
- Supply: 4.0–5.5 V (datasheet operating range). It will not run reliably at 3.3 V.
- Current: up to about 330 mA with every LED on at full brightness; 150 µA in shutdown.
- Logic inputs: VIH 3.5 V min, VIL 0.8 V max at 5 V supply. 3.3 V GPIO is below the guaranteed high level; it usually works, a 74HCT125 buffer makes it certain.
- Serial timing: CLK period ≥ 100 ns (10 MHz), data setup 25 ns.

## Interface details
- 16-bit frames, MSB first: D15–D8 address (D11–D8 used), D7–D0 data. Data is sampled on CLK rising edge and latched on the LOAD (CS) rising edge.
- Registers: 0x01–0x08 rows 0–7 (digit 0–7), 0x09 decode mode, 0x0A intensity (0–15), 0x0B scan limit, 0x0C shutdown (0 = off, 1 = on), 0x0F display test, 0x00 no-op.
- Power-up: shutdown, scan limit 0 (one row), no decode, minimum intensity. Initialise with display test 0, scan limit 7, decode 0, intensity, clear rows, then shutdown = 1.
- FC-16 orientation: register 0x01 is the top row, bit 7 the leftmost LED.
- Chained modules: send one frame per module in a single CS-low burst, the last module's frame first.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, DIN → D23, CLK → D18, CS → D5.
- Pico: VCC → VBUS, GND → GND, DIN → GP11, CLK → GP10, CS → GP13 (SPI1).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CS → pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from max7219 import MAX7219
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
m = MAX7219(spi, 5)          # CS on GPIO5; MAX7219(spi, 5, num=4) for a 4-in-1 strip
for y, bits in enumerate([0x3C, 0x42, 0xA5, 0x81, 0xA5, 0x99, 0x42, 0x3C]):
    m.set_row(y, bits)
m.show()
m.brightness(2)              # 0..15
```

## Gotchas
- Nothing lights: VCC must be 5 V, and the driver must take the chip out of shutdown (0x0C = 1); it powers up dark.
- Only the top row lights: the scan-limit register was left at its power-up value; set 0x0B = 7.
- Wired to the wrong edge: the input side has DIN; the DOUT side does nothing when driven.
- Brownouts or resets at full brightness: keep intensity low on USB power and add 10 µF + 0.1 µF across VCC/GND.
- Image mirrored or rotated: some clone modules mount the matrix differently from FC-16; flip the bit order or rows in software.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf
