---
name: part-veml6070
description: Pinout, electrical limits, wiring and MicroPython driver for the VEML6070 UV light sensor (Vishay VEML6070). Use when designing, wiring, simulating or writing code for a VEML6070 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VEML6070 UV light sensor (VEML6070)

## Overview
The **VEML6070** from Vishay measures UVA light (peak 355 nm, 320–410 nm) and returns a 16-bit reading in "steps" over I2C. Its refresh time is set by an external RSET resistor and a 2-bit integration time (½T, 1T, 2T, 4T). Hobbyists buy it on the **Adafruit VEML6070 UV Index Sensor Breakout (#2899)**, which has 10k pull-ups on SCL, SDA and ACK, a 270k RSET and no regulator. Clone boards copied from that design use the same header.

## Pinout (Adafruit #2899, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V, straight to the chip (also feeds the pull-ups) |
| G | Ground |
| SCL | I2C clock (10k pull-up) |
| SDA | I2C data (10k pull-up) |
| ACK | Alert output, open-drain, 10k pull-up (optional) |

## Electrical limits
- Supply: 2.7–5.5 V (chip); 6.0 V absolute maximum. The board is labelled 2.8–5 V, Adafruit says 3–5 V.
- Current: 100 µA typical, 250 µA max; about 1 µA in shutdown.
- I2C 10–400 kHz.
- The pull-ups go to VIN, so with a 3.3 V microcontroller power the board from 3.3 V.

## Interface details
- No register pointer. Three addresses: **0x38** (write the command byte; read the LSB), **0x39** (read the MSB; never write), **0x0C** (alert response address; reading it clears an ACK alert).
- Command byte: bit 5 ACK enable, bit 4 ACK_THD (0 = 102 steps, 1 = 145 steps), bits 3:2 IT (00 ½T, 01 1T, 10 2T, 11 4T), bit 1 reserved = 1, bit 0 SD (1 = shutdown).
- Initialise within 150 ms of power-up: read 0x0C once, then write **0x06** to 0x38 (1T, running).
- Reading: read 1 byte from 0x39 (MSB), then 1 byte from 0x38 (LSB); value = MSB × 256 + LSB.
- Refresh time: 1T = 125 ms at RSET 300k, 250 ms at 600k (scales with RSET); about 113–126 ms on the 270k board.
- Sensitivity: 5 µW/cm² per step at RSET 240k, 1T (365 nm).
- UV risk bands at 1T / 270k (app note 84310): 0–560 low, 561–1120 moderate, 1121–1494 high, 1495–2054 very high, 2055+ extreme. Divide by 2 at 2T or 4 at 4T first.

## Wiring
- ESP32: VIN → 3V3, G → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), G → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), G → pin 6, SDA → pin 3, SCL → pin 5.
- ACK is optional: wire it to any GPIO (with the board on 3.3 V) to get an alert.

## Using the driver
```python
from machine import I2C, Pin
from veml6070 import VEML6070, IT_1
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
uv = VEML6070(i2c, it=IT_1)
steps = uv.raw()
print('UV=%d risk=%s' % (steps, uv.risk(steps)))
```

## Gotchas
- It occupies 0x38, 0x39 and 0x0C: an AHT10/AHT20 (0x38) or a PCF8574A board at 0x38/0x39 on the same bus will clash.
- `i2c.scan()` may not list 0x0C; that is normal when no alert is pending.
- If the ACK alert is active, the chip ignores its other addresses until 0x0C is read.
- Glass and most plastics block UV, so indoor readings are near zero. Test in sunlight.
- The reading is relative UVA, not a calibrated UV index; the risk bands are only a guide.

## Datasheet
https://www.vishay.com/docs/84277/veml6070.pdf
