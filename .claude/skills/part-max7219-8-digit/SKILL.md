---
name: part-max7219-8-digit
description: Pinout, electrical limits, wiring and MicroPython driver for the MAX7219 8-digit 7-segment LED display module (Maxim/Analog Devices MAX7219). Use when designing, wiring, simulating or writing code for a MAX7219 8-digit display in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX7219 8-digit 7-segment display (MAX7219)

## Overview
The **MAX7219** is a serial LED driver that multiplexes up to eight common-cathode 7-segment digits by itself (about 800 Hz scan), with a built-in Code B digit font and 16-step digital brightness. Hobbyists buy it as the **generic MAX7219 8-digit 7-segment module**: a red PCB with two 0.36" 4-digit displays, a 5-pin input header and a matching output header for chaining.

## Pinout (input header, order printed on the board)
| Pin | Function |
|---|---|
| VCC | Supply, 4.0–5.5 V (use 5 V); no regulator on the module |
| GND | Ground |
| DIN | Serial data in (SPI MOSI) |
| CS | LOAD: rising edge latches the last 16 bits |
| CLK | Serial clock (SPI SCK), up to 10 MHz |

The output header (VCC, GND, DOUT, CS, CLK) feeds the next module in a chain.

## Electrical limits
- Supply: 4.0–5.5 V (datasheet). Do not run it from 3.3 V.
- Current: roughly 10 mA blank, up to a few hundred mA with every segment lit at full brightness.
- Logic inputs: VIH min 3.5 V, VIL max 0.8 V. 3.3 V MCU outputs are below VIH; they usually work, but use a 74HCT125 level shifter if digits glitch.
- Timing: CLK period ≥ 100 ns (10 MHz), DIN setup 25 ns, LOAD high ≥ 50 ns.

## Interface details
- 16-bit frames, MSB first, sampled on CLK rising edges (SPI mode 0). D11–D8 = register, D7–D0 = data; LOAD/CS rising latches.
- Registers: 0x01–0x08 digits 0–7, 0x09 decode mode, 0x0A intensity (0–15), 0x0B scan limit (0–7), 0x0C shutdown (0 = off, 1 = on), 0x0F display test, 0x00 no-op.
- Power-up: shutdown, no decode, scan one digit. Initialise: test 0, scan limit 7, decode 0xFF, intensity, then shutdown 1.
- Code B font: 0–9, 0x0A '-', 0x0B 'E', 0x0C 'H', 0x0D 'L', 0x0E 'P', 0x0F blank; bit D7 = decimal point.
- On this module digit 0 (register 0x01) is the rightmost digit.

## Wiring
- ESP32: VCC → VIN (5 V), GND → GND, DIN → D23, CLK → D18, CS → D5. Use `SPI(1, ...)`.
- Pico: VCC → VBUS (5 V), GND → GND, DIN → GP19, CLK → GP18, CS → GP17. Use `SPI(0, ...)`.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, DIN → pin 19 (MOSI), CLK → pin 23 (SCLK), CS → pin 24 (CE0).

## Using the driver
```python
from machine import Pin, SPI
from max7219_8digit import MAX7219
spi = SPI(1, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(23))
d = MAX7219(spi, 5)
d.number(12345678)
d.number(21.5, decimals=1)   # decimal point via bit D7
d.text('HELP')
d.brightness(3)
```

## Gotchas
- Nothing lit after power-up: the chip starts in shutdown. Write 1 to register 0x0C.
- All segments lit: display-test mode (0x0F) is on; write 0 to it.
- Don't use the scan-limit register to blank leading zeros; write the blank code instead.
- Chaining: frames go to the last module first; send no-op (0x00 0x00) frames to the modules you are not updating, then raise CS once.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf
