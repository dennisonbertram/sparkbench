---
name: part-adafruit-quad-rotary-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit I2C Quad Rotary Encoder Breakout with NeoPixel (product 5752, "NeoRotary 4", ATtiny817 running seesaw firmware). Use when designing, wiring, simulating or writing code for this four-knob I2C rotary encoder board in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit I2C Quad Rotary Encoder (Adafruit 5752)

## Overview
Four rotary encoders with push switches, read over I2C. An **ATtiny817** running Adafruit's **seesaw** firmware counts the detents of each encoder in its own signed 32-bit position and reads the four knob switches, so the whole board needs only SDA and SCL. There is a NeoPixel under each knob (seesaw pin 18, 4 pixels), two STEMMA QT / Qwiic sockets and an INT output. You solder the four encoders yourself (any PEC11-style encoder, with or without a switch).

## Pinout (header order, as printed on the board)
The 6-pad header appears twice (top and bottom edge, same signals). Left to right:

| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V. It is also the I2C logic level, so use your board's logic voltage |
| - | Ground |
| C | I2C clock SCL (10 k pull-up to VIN on board) |
| D | I2C data SDA (10 k pull-up to VIN on board) |
| INT | Interrupt output, pulses low on a turn or press (only when enabled in seesaw) |
| UPDI | Unlabelled pad: ATtiny817 programming pin, leave unconnected |

## Electrical limits
- Supply: 3-5 V on VIN (ATtiny817 runs straight from VIN; no regulator or level shifter).
- The SDA/SCL pull-ups go to VIN. On a 3.3 V board (ESP32, Pico, Raspberry Pi) power it from **3.3 V**, never 5 V, or the I2C lines are pulled to 5 V.
- Current: a few mA, plus up to about 20 mA per NeoPixel at full white.

## Interface details
- **I2C address 0x49** by default. Cutting the A0/A1/A2 jumpers on the back adds 1/2/4 (up to 0x50).
- seesaw protocol: write `[module base, function register]` plus any data. To read, write the two bytes, wait (the driver waits 8 ms), then read. Values are big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x87** (ATtiny817). VERSION 0x02 (4 bytes): the top 16 bits are the product number, **5752**. SWRST 0x7F: write 0xFF, then wait about 500 ms.
- ENCODER base 0x11: POSITION is register **0x30 + n** for encoder n (0-3), a signed 32-bit count of detents (writable). DELTA is **0x40 + n**, cleared on read.
- Switches: seesaw GPIO pins **12, 14, 17, 9** for encoders #0, #1, #2, #3. Set them as inputs with pull-ups (DIRCLR_BULK 0x01 0x03, PULLENSET 0x01 0x0B, BULK_SET 0x01 0x05 with the pin mask), then read GPIO_BULK (0x01 0x04, 4 bytes). A bit reads 0 while that knob is pressed.

## Wiring
- ESP32: VIN → 3V3, - → GND, D → D21, C → D22.
- Pico: VIN → 3V3(OUT), - → GND, D → GP4, C → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), - → pin 6, D → pin 3, C → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from seesaw_quad_encoder import QuadEncoder
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
q = QuadEncoder(i2c)                 # address 0x49
print(q.positions(), q.pressed_all())
q.pixel(0, 0, 40, 0)                 # green under knob #0
```

## Gotchas
- Always leave a short delay between the register write and the read.
- Encoder #3's switch is seesaw pin 9 (per Adafruit's own examples and library); the learn guide's encoder #0 B-pin listing also shows 9, which is a typo there.
- Direction: Adafruit's example negates position to make clockwise positive. Flip the sign if needed.
- In the Sparkbench simulator the sliders set each POSITION register; DELTA is not modelled, so use `position()` there.
- Driver raises OSError if the seesaw at that address is not product 5752 (e.g. a single-encoder board at 0x36).

## Datasheet
- ATtiny817 (the chip): https://ww1.microchip.com/downloads/en/DeviceDoc/ATtiny417-814-816-817-DataSheet-DS40002288A.pdf
- Board guide: https://learn.adafruit.com/adafruit-i2c-quad-rotary-encoder-breakout
