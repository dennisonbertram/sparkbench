---
name: part-m5stack-unit-encoder
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Encoder (SKU U135, rotary encoder with push switch and two SK6812 RGB LEDs, STM32F030 firmware at I2C address 0x40, Grove HY2.0-4P). Use when designing, wiring, simulating or writing code for an M5Stack Unit Encoder in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Encoder (U135)

## Overview
A rotary encoder knob with a push switch and two SK6812 RGB LEDs, read over I2C. An **STM32F030F4P6** running M5Stack's firmware counts the knob in a signed 16-bit counter, reads the switch and drives the LEDs, so you only need SDA and SCL. An HT7533 regulator makes 3.3 V for the MCU from the 5 V pin; the LEDs run from 5 V.

## Pinout (Grove HY2.0-4P, M5Stack PinMap order)
| Pin | Wire | Function |
|---|---|---|
| GND | Black | Ground |
| 5V | Red | Supply, 5 V |
| SDA | Yellow | I2C data (10 k pull-up to the unit's 3.3 V) |
| SCL | White | I2C clock (10 k pull-up to the unit's 3.3 V) |

## Electrical limits
- Supply: **5 V** (4.5-5.5 V; the SK6812 LEDs need 5 V). About 17 mA with the LEDs off, up to roughly 100 mA more with both LEDs full white.
- The I2C lines are pulled up to the unit's own 3.3 V, so they are safe for 3.3 V boards (ESP32, Pico, Raspberry Pi).

## Interface details (I2C address 0x40)
| Reg | Access | Content |
|---|---|---|
| 0x00 | W | Mode: 0 = pulse (default), 1 = AB |
| 0x10 | R/W | Counter, signed 16-bit, **low byte first** (0x10 L, 0x11 H) |
| 0x20 | R | Switch: **0 while pressed** (see Gotchas) |
| 0x30 | W | LED index (0 = both, 1, 2), then R, G, B |
| 0x40 | W | Write 1 to reset the counter |

Read: write the register number, then read the bytes. Write: register number followed by the data in one transfer.

## Wiring
| Unit | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| GND (black) | GND | GND | pin 6 |
| 5V (red) | 5V / VIN | VBUS | pin 2 |
| SDA (yellow) | GPIO21 | GP4 | pin 3 |
| SCL (white) | GPIO22 | GP5 | pin 5 |

Use a Grove-to-jumper cable on a breadboard.

## Using the driver
```python
from machine import I2C, Pin
from m5_unit_encoder import UnitEncoder
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
enc = UnitEncoder(i2c)            # address 0x40
print(enc.value(), enc.pressed())
enc.set_led(0, 0, 40, 0)          # both LEDs dim green
enc.reset()                       # counter back to 0
```

## Gotchas
- **Switch polarity:** M5Stack's protocol PDF says 1 = pressed, but the switch pulls a 10 k pull-up to GND and M5Stack's own Arduino example (`if (!btn_status)`) and UIFlow driver (`not buf[0]`) both treat **0 as pressed**. The driver follows the code. If your firmware is different, flip `pressed()`.
- The counter is 16-bit and wraps at ±32768.
- Needs 5 V: from 3.3 V the LEDs do not light properly.
- In the Sparkbench simulator the slider sets the counter register; LED colours and mode writes are accepted but not shown.

## Datasheet
- Product page / PinMap: https://docs.m5stack.com/en/unit/encoder
- I2C protocol: https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/801/Unit-Encoder_Protocol.pdf
- Schematic: https://static-cdn.m5stack.com/resource/docs/products/unit/encoder/encoder_sch_01.webp
