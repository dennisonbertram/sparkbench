---
name: part-pimoroni-rgb-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the Pimoroni RGB Encoder Breakout (PIM522, rotary encoder with an RGB LED in the shaft, Nuvoton MS51 running Pimoroni's IO Expander firmware at I2C address 0x0F). Use when designing, wiring, simulating or writing code for a Pimoroni RGB encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Pimoroni RGB Encoder Breakout (PIM522)

## Overview
A continuous-rotation rotary encoder (24 detents, no push switch) with a red/green/blue LED shining through its clear shaft, read over I2C. A **Nuvoton MS51** microcontroller running Pimoroni's **IO Expander ("ioe") firmware** counts the encoder in hardware and drives the three LED colours with its PWM unit, so your board only needs SDA and SCL. It is the same firmware as Pimoroni's IO Expander breakout, so the chip's pins have to be set up over I2C before it counts.

## Pinout (5-pin header, as printed)
| Pin | Function |
|---|---|
| 3-5V | Supply, 3-5 V (MS51 2.4-5.5 V, no regulator) |
| SDA | I2C data (10 k pull-up to 3-5V) |
| SCL | I2C clock (10 k pull-up to 3-5V) |
| INT | Interrupt output, low when the count changed (optional) |
| GND | Ground |

The order matches Raspberry Pi header pins 1, 3, 5, 7, 9 (3V3, SDA, SCL, GPIO4, GND), so the board can plug straight onto a Pi with the supplied right-angle socket.

## Electrical limits
- Supply 3-5 V on the board (MS51: 2.4-5.5 V). There is **no regulator**: the SDA/SCL/INT pull-ups go to the supply pin, so on a 3.3 V board (ESP32, Pico, Pi) feed it **3.3 V**.
- Current: a few mA plus up to roughly 20 mA with the LED fully on.
- I2C 100/400 kHz.

## Interface details (I2C address 0x0F)
| Reg | Content |
|---|---|
| 0xFA / 0xFB | Chip ID low / high = 0x6A / 0xE2 (0xE26A) |
| 0xFC | Firmware version |
| 0x04 | ENC_EN: bit 0 enable channel 1, bit 1 count microsteps |
| 0x05 | ENC_1_CFG: pin A | pin B << 4 (0x3C for this board) |
| 0x06 | ENC_1_COUNT: 8-bit two's-complement count, wraps |
| 0xF9 | INT: bit 0 flag (count changed), bit 1 drive INT pin, bit 2 INT on P0.0 |
| 0x98 | PWMCON0: bit 7 PWMRUN, bit 6 LOAD (self-clearing) |
| 0x99 / 0x91 | PWM period low / high |
| 0xCB/0xC8, 0x9B/0x93, 0x9C/0x94 | Duty low/high for red (PWM5), green (PWM1), blue (PWM2) |
| 0xFD / 0xFE | I2C address (bit 4 of CTRL unlocks it; kept in flash) |

Board wiring of the MS51 (IOE pin numbers): encoder A = pin 12 (P0.5), B = pin 3 (P1.2), common C = pin 11 (P0.6, open-drain low); LED red = pin 1, green = pin 7, blue = pin 2 (inverted PWM).
Read a register: write its number, then read (repeated start, `readfrom_mem`). Write: register number then the value.

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 3-5V | 3V3 | 3V3(OUT) | pin 1 |
| SDA | GPIO21 | GP4 | pin 3 |
| SCL | GPIO22 | GP5 | pin 5 |
| INT (optional) | any GPIO | any GP | pin 7 |
| GND | GND | GND | pin 9 |

## Using the driver
```python
from machine import I2C, Pin
from pimoroni_rgb_encoder import RGBEncoder
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
enc = RGBEncoder(i2c)          # checks the chip ID, sets up the encoder and PWM
enc.set_led(0, 0, 255)         # blue
print(enc.read())              # steps since clear()
enc.clear()
enc.direction = -1             # reverse the counting direction
```

## Gotchas
- Nothing counts until the driver has configured the encoder pins and ENC_EN; a fresh chip reads 0 forever otherwise.
- The hardware count is only 8 bits. The driver extends it by watching for wraps, so poll `read()` at least every ~64 steps of fast turning.
- Changing the address with `set_address()` stores it in flash; note the new address or you will have to scan for it.
- There is no push switch on this encoder (the RGB Potentiometer breakout is the version with end stops).
- In the Sparkbench simulator the slider sets the count register; LED colours are accepted but not shown.

## Datasheet
- MS51 datasheet: https://cdn.shopify.com/s/files/1/0174/1800/files/DS_MS51_16KBFlash_Series_EN_Rev1.01.pdf
- MS51 technical reference: https://cdn.shopify.com/s/files/1/0174/1800/files/TRM_MS51_16KBFlash_Series_EN_Rev1.03.pdf
- Product page: https://shop.pimoroni.com/products/rgb-encoder-breakout
- Firmware register map / library: https://github.com/pimoroni/ioe-python
