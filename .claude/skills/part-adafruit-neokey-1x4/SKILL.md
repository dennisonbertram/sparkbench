---
name: part-adafruit-neokey-1x4
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit NeoKey 1x4 QT I2C (product 4980), four Cherry MX-compatible key sockets with a WS2812B NeoPixel under each key, read and lit over I2C by an ATSAMD09 running seesaw firmware. Use when designing, wiring, simulating or writing code for a NeoKey 1x4 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit NeoKey 1x4 QT I2C (Adafruit 4980)

## Overview
A strip of four hot-swap (Kailh) sockets for Cherry MX-compatible key switches, each with a WS2812B RGB NeoPixel under it. An **ATSAMD09D14** running Adafruit's **seesaw** firmware reads the keys and drives the NeoPixels, so the whole board needs only SDA and SCL. It has two STEMMA QT / Qwiic sockets, a 3.3 V regulator (AP2112K) and BSS138 level shifters on the I2C lines. Key switches are sold separately.

## Pinout (header order, as printed on the board)
The 6-pin header appears twice (along both long edges, same signals), so the board does not sit in a breadboard as a single row: wire it with jumper leads to one header or with a STEMMA QT cable. Silkscreen labels, from pin 1:

| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (use your board's logic voltage); also powers the NeoPixels |
| 3 | 3.3 V regulator output, up to 100 mA (leave unconnected) |
| - | Ground |
| C | I2C clock (SCL), 10 k pull-up to VIN, level-shifted |
| D | I2C data (SDA), 10 k pull-up to VIN, level-shifted |
| INT | seesaw interrupt output, goes low on a key change (only when enabled) |

## Electrical limits
- Supply: 3-5 V on VIN. The SAMD09 runs from the on-board 3.3 V regulator.
- I2C is level-shifted with 10 k pull-ups to VIN, so power VIN from the same voltage as your board's logic (3V3 for ESP32/Pico/Pi).
- Current: about 5 mA idle; each NeoPixel draws up to about 60 mA at full white, so up to about 250 mA with all four at full brightness. Keep brightness low when powered from a 3V3 pin.
- INT is driven by the 3.3 V SAMD09.

## Interface details
- **I2C address 0x30** by default. Jumpers A0/A1/A2/A3 on the back add 1/2/4/8 (0x30-0x3F, up to 16 boards).
- seesaw protocol: write `[module base, function register]` plus any data. To read, write the two bytes, wait (8 ms in this driver, as in Adafruit's libraries), then read. Big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x55** (SAMD09). SWRST 0x7F: write 0xFF, then wait about 500 ms.
- Keys: SWITCHA-SWITCHD are seesaw pins **4, 5, 6, 7** (PA04-PA07) to GND. Set them up with DIRCLR_BULK (0x01 0x03), PULLENSET (0x01 0x0B) and BULK_SET (0x01 0x05), mask 0x000000F0. Read GPIO_BULK (0x01 0x04, 4 bytes); a bit reads 0 while its key is pressed. INTENSET (0x01 0x08) with the same mask enables INT.
- NeoPixels: seesaw pin 3, NEOPIXEL base 0x0E. PIN 0x01 = 3, SPEED 0x02 = 1 (800 kHz), BUF_LENGTH 0x03 = 12 (2 bytes), BUF 0x04 = 2-byte offset then GRB bytes, SHOW 0x05.

## Wiring
- ESP32: VIN → 3V3, - → GND, D → D21, C → D22.
- Pico: VIN → 3V3(OUT), - → GND, D → GP4, C → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), - → pin 6, D → pin 3, C → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from neokey1x4 import NeoKey1x4
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
nk = NeoKey1x4(i2c)               # address 0x30
print(nk.keys())                  # [A, B, C, D] True = pressed
nk.pixel(0, 0, 40, 0)             # key A green
```

## Gotchas
- Key A (seesaw pin 4, index 0) is the key at the VIN / "on" LED end of the board.
- Always wait a few ms between the register write and the read, or you get stale bytes.
- In the Sparkbench simulator the four keys are toggles; the NeoPixel colours are accepted but not shown.
- Several boards on one bus: give each its own address with the A0-A3 jumpers.

## Datasheet
- SAMD09 (the chip): https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-42414-SAM-D09_Datasheet.pdf
- Board guide: https://learn.adafruit.com/neokey-1x4-qt-i2c
