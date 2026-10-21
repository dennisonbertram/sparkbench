---
name: part-adafruit-neoslider
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit NeoSlider I2C QT slide potentiometer with 4 NeoPixels (product 5295, ATtiny817 running seesaw firmware). Use when designing, wiring, simulating or writing code for the NeoSlider in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit NeoSlider (Adafruit 5295)

## Overview
A 75 mm linear slide potentiometer with four reverse-mount RGB NeoPixels under it, read and driven over I2C. An **ATtiny817** running Adafruit's **seesaw** firmware reads the slider with its 10-bit ADC (seesaw pin 18) and drives the NeoPixels (seesaw pin 14), so you only need SDA and SCL. It has two STEMMA QT / Qwiic sockets and two identical 6-pad header rows (one above and one below the slider).

## Pinout (header order, as printed on the board)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V. Use the same voltage as your board's logic (3.3 V on ESP32/Pico) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up to VIN on board) |
| SDA | I2C data (10 k pull-up to VIN on board) |
| INT | Interrupt output, active low (optional; it must be enabled in seesaw) |
| UPDI | ATtiny817 programming pin (leave unconnected) |

## Electrical limits
- Supply: 3-5 V on VIN ("VLogic/Vcc: 3-5VDC" on the back). There is no regulator: the ATtiny817 runs straight from VIN.
- SDA/SCL are pulled up to VIN with 10 k, and INT swings to VIN. **Power it from 3.3 V** when you use a 3.3 V board (ESP32, Pico, Raspberry Pi), or the bus is pulled up to 5 V.
- Current: a few mA, plus up to about 60 mA more with all four NeoPixels at full white.

## Interface details
- **I2C address 0x30** by default. Cutting the A0/A1/A2/A3 jumpers on the back adds 1/2/4/8, giving up to 0x3F (16 boards on one bus).
- The seesaw protocol: write `[module base, function register]` with any data after it. To read, write the two bytes, wait (the driver waits 8 ms, as Adafruit's library does), then read. Values are big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x87** (ATtiny817). SWRST 0x7F: write 0xFF, then wait about 500 ms.
- Slider: ADC base 0x09, register 0x07 + pin = **0x19** for pin 18. Returns 2 bytes, a 10-bit reading 0-1023 from one end to the other.
- NeoPixels: NEOPIXEL base 0x0E. PIN 0x01 = 14, BUF_LENGTH 0x03 = 12 (4 pixels x 3 bytes, 16-bit), BUF 0x04 = 2-byte start offset then G, R, B bytes, SHOW 0x05 latches them.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- You can also use a STEMMA QT / Qwiic cable instead of the header.

## Using the driver
```python
from machine import I2C, Pin
from neoslider import NeoSlider
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
s = NeoSlider(i2c)          # address 0x30
print(s.position())         # 0-1023
s.fill(0, 0, 40)            # all four pixels dim blue
```

## Gotchas
- Always leave a short delay between the register write and the read. Reading too quickly returns stale or garbage bytes.
- The ADC reading is ratiometric (the pot sits across the ATtiny's supply), so it doesn't change with VIN. It is noisy by a count or two, so smooth it if you need a steady value.
- Several NeoSliders on one bus: give each its own address with the A0-A3 jumpers (cut = 1).
- In the Sparkbench simulator the slider sets the ADC reading. The NeoPixel writes are accepted but not drawn.

## Datasheet
- ATtiny817 (the chip): https://ww1.microchip.com/downloads/en/DeviceDoc/ATtiny417-814-816-817-DataSheet-DS40002288A.pdf
- Board guide: https://learn.adafruit.com/adafruit-neoslider
