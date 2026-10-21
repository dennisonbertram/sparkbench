---
name: part-sparkfun-qwiic-led-stick
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic LED Stick - APA102C (COM-18354, ten APA102C RGB LEDs driven over I2C by an ATtiny85). Use when designing, wiring, simulating or writing code for a Qwiic LED Stick in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic LED Stick - APA102C (COM-18354)

## Overview
A bar of **10 APA102C RGB LEDs** (numbered 0-9 on the silkscreen) with an **ATtiny85** running SparkFun's Qwiic_LED_Stick firmware. You send short I2C command writes (colour of one LED, all LEDs, colour arrays, 5-bit brightness, off); the firmware keeps the colour + brightness of up to 100 LEDs and shifts them out to the APA102C chain after every write. No SPI timing work on your board, and only two wires.

## Pinout (left 0.1" header, top to bottom as printed: GND, 3.3V, SDA, SCL, VIN, GND)
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply 3.3 V (ATtiny85, and the LEDs with the default VLED jumper) |
| SDA | I2C data (4.7 kΩ pull-up to 3.3 V on the board) |
| SCL | I2C clock (4.7 kΩ pull-up to 3.3 V on the board) |
| VIN | Separate LED supply 3.0-5.5 V, only after moving the VLED jumper (leave unconnected) |
| GND (GND2) | Spare ground for the VIN supply (leave unconnected) |

Two Qwiic (JST-SH) connectors carry GND, 3.3V, SDA, SCL. The right edge has a 4-pin output header **VLED, CO, DO, GND** for chaining more APA102 LEDs; it is not needed for normal use.

## Electrical limits
- Supply: 3.3 V (no regulator; Qwiic is 3.3 V). APA102C: 3.0-5.5 V.
- Current: about 65 mA with all 10 LEDs full white at full brightness (SparkFun measurement); up to ~40 mA per LED on a 5 V VIN supply.
- I2C 100/400 kHz, 3.3 V logic.

## Interface details
- **I2C address 0x23**; ADR jumper closed = **0x22**; command 0xC7 stores a new address (0x08-0x77) in EEPROM.
- Write-only command protocol (no register reads):

| Bytes | Effect |
|---|---|
| `0x70 n` | LED count 1-100 (EEPROM, default 10) |
| `0x71 i r g b` | colour of LED i (0 = first LED) |
| `0x72 r g b` | colour of all LEDs |
| `0x73/0x74/0x75 len off v...` | red/green/blue for LEDs off..off+len-1 (max 12 values per write) |
| `0x76 i bri` | brightness 0-31 of LED i |
| `0x77 bri` | brightness 0-31 of all LEDs |
| `0x78` | all colours to 0 (brightness kept) |
| `0xC7 addr` | change I2C address |

- Colours start at 0 (off), brightness at 31 after power-up.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_led_stick import LEDStick
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
stick = LEDStick(i2c)                 # 0x23
stick.set_led_color(0, 255, 0, 0)     # first LED red
stick.set_all(0, 0, 40)               # everything dim blue
stick.set_colors([255]*10, [0]*10, list(range(0, 250, 25)))
stick.set_all_brightness(5)           # 0-31
stick.off()
```

## Gotchas
- LED numbers start at **0** on current (v2, 2021) firmware, matching the board. Old v1 sticks (COM-14783) and some library comments say "starts at 1".
- Keep each write at 16 bytes or less (ATtiny85 buffer): the driver splits colour arrays into 12-value chunks.
- `off()` clears colours only; brightness 0 keeps the colour and turns the LED dark.
- Many Qwiic boards on one bus all add pull-ups; cut the I2C jumper on some if needed.
- Long chains need the VLED jumper moved to VIN and a separate 5 V supply with common ground.

## Datasheet
APA102C: https://raw.githubusercontent.com/sparkfun/Qwiic_LED_Stick/main/APA102C%20Datasheet.pdf ; firmware: https://github.com/sparkfun/Qwiic_LED_Stick ; hookup guide: https://learn.sparkfun.com/tutorials/qwiic-led-stick---apa102c-hookup-guide/all
