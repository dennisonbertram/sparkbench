---
name: part-adafruit-i2c-qt-rotary-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the Adafruit I2C Stemma QT Rotary Encoder breakout (product 4991, ATSAMD09 running seesaw firmware). Use when designing, wiring, simulating or writing code for this I2C rotary encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Adafruit I2C QT Rotary Encoder (Adafruit 4991)

## Overview
A rotary encoder with a push switch, read over I2C. An **ATSAMD09** running Adafruit's **seesaw** firmware counts the detents in a signed 32-bit position and reads the knob's switch, so you only need SDA and SCL. It has two STEMMA QT / Qwiic sockets, an on-board NeoPixel on seesaw pin 6, and a 3.3 V regulator with level-shifted I2C. On product 4991 you solder the encoder yourself (any PEC11-style encoder with a switch). Product 5880 is the same board with the encoder already fitted.

## Pinout (header order, as printed on the board)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (use the same voltage as your board's logic) |
| 3Vo | 3.3 V regulator output, up to 100 mA (leave unconnected) |
| GND | Ground |
| SCL | I2C clock (10 k pull-up on board) |
| SDA | I2C data (10 k pull-up on board) |
| INT | Interrupt output, active low (optional; it must be enabled in seesaw) |

## Electrical limits
- Supply: 3-5 V on VIN. The AP2112K regulator feeds the SAMD09 with 3.3 V.
- The I2C lines are level-shifted (BSS138), so 3.3 V and 5 V logic are both fine.
- Current: a few mA, plus up to about 20 mA more when the NeoPixel is lit.

## Interface details
- **I2C address 0x36** by default. Closing the A0/A1/A2 jumpers on the back adds 1/2/4, giving up to 0x3D.
- The seesaw protocol: write `[module base, function register]` with any data after it. To read, write the two bytes, wait (the driver waits 8 ms, as Adafruit's CircuitPython library does), then read. Values are big-endian.
- STATUS base 0x00: HW_ID 0x01 reads **0x55** on this SAMD09 board. SWRST 0x7F: write 0xFF, then wait about 500 ms.
- ENCODER base 0x11: POSITION 0x30 is a signed 32-bit count of detents (you can also write it to set the count). DELTA 0x40 is the change since its last read, and reading it clears it.
- Switch: seesaw GPIO pin 24. Set it up with DIRCLR_BULK (0x01 0x03), PULLENSET (0x01 0x0B) and BULK_SET (0x01 0x05), each with the mask 1<<24. Then read GPIO_BULK (0x01 0x04, 4 bytes). Bit 24 reads 0 while the knob is pressed.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- You can also use a STEMMA QT / Qwiic cable instead of the header.

## Using the driver
```python
from machine import I2C, Pin
from seesaw_encoder import SeesawEncoder
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
enc = SeesawEncoder(i2c)          # address 0x36
print(enc.position(), enc.pressed())
```

## Gotchas
- Always leave a short delay between the register write and the read. Reading too quickly returns stale or garbage bytes.
- Direction: Adafruit's CircuitPython example negates the position so that clockwise counts up. Flip the sign in your code if it turns the wrong way.
- In the Sparkbench simulator, the slider sets the POSITION register. DELTA is not modelled, so use `position()` there.
- Several encoders on one bus: give each board its own address with the A0-A2 jumpers.

## Datasheet
- SAMD09 (the chip): https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-42414-SAM-D09_Datasheet.pdf
- Board guide: https://learn.adafruit.com/adafruit-i2c-qt-rotary-encoder
