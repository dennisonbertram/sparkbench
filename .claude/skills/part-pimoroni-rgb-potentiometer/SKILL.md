---
name: part-pimoroni-rgb-potentiometer
description: Pinout, electrical limits, wiring and MicroPython driver for the Pimoroni RGB Potentiometer Breakout (PIM523, Nuvoton MS51XB9AE running Pimoroni's IO Expander firmware, I2C 0x0E), a rotary pot with an RGB LED in the shaft. Use when designing, wiring, simulating or writing code for this I2C RGB knob in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Pimoroni RGB Potentiometer Breakout (PIM523)

## Overview
A linear rotary potentiometer with a common-cathode RGB LED inside its clear shaft. A **Nuvoton MS51XB9AE** microcontroller running Pimoroni's **IO Expander** firmware does the work: its 12-bit ADC reads the wiper and three of its PWM channels light the LED. The MCU's special function registers are exposed one-to-one as I2C registers, so the driver works with MS51 register names (ADCCON0, PWMCON0, PxM1/PxM2...).

## Pinout (header order, as printed on the board)
| Pin | Function |
|---|---|
| 3-5V | Supply, 3-5 V (reverse-polarity protected) |
| SDA | I2C data |
| SCL | I2C clock |
| INT | Interrupt output (optional, off by default) |
| GND | Ground |

The header lines up with Raspberry Pi pins 1, 3, 5, 7, 9.

## Electrical limits
- Supply 3-5 V (MS51 itself 2.4-5.5 V). I/O levels follow the supply, so use 3.3 V with an ESP32 or Pico.
- About 5 mA plus up to roughly 15 mA with the LED at full white.
- The board relies on the host's I2C pull-ups (a Pi has them): add 4.7 k to 3.3 V on SDA and SCL.

## Interface details
- **I2C address 0x0E** (can be changed in software; stored in flash). Chip ID at 0xFA/0xFB = 0xE26A (little-endian).
- Pot wiring inside: track ends on IO-expander pins 12 (P0.5) and 3 (P1.2), wiper on pin 11 (P0.6, ADC channel 3). The track ends must be push-pull outputs, one low and one high, or the wiper floats. Clockwise-increasing: P0.5 low, P1.2 high.
- ADC read: write `1<<3` to AINDIDS0 (0xB6); write ADCCON0 (0xA8) = channel 3, ADCF (bit 7) = 0, ADCS (bit 6) = 1; poll until ADCF = 1; read 2 bytes from ADCRL (0x82): `raw = (ADCRH << 4) | (ADCRL & 0x0F)`. Per the MS51 TRM, raw = 4095 x Vain / VREF (VREF = VDD), so the knob position raw/4095 is independent of the supply.
- LED: red PWM5 (P1.5, duty regs 0xCB/0xC8), green PWM1 (P1.1, 0x9B/0x93), blue PWM2 (P1.0, 0x9C/0x94). Enable each in PIOCON0/1, invert it in PNP (0x96), set PWMRUN (PWMCON0 bit 7), period in PWMPL/PWMPH (0x99/0x91), then set LOAD (PWMCON0 bit 6) and wait for it to clear.
- P0 (0x40) and P1 (0x50) are bit-addressed by the firmware: write `(state << 3) | bit`.

## Wiring
- ESP32: 3-5V -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (4.7 k pull-ups to 3V3).
- Pico: 3-5V -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5 (4.7 k pull-ups to 3V3).
- Raspberry Pi: plug onto pins 1, 3, 5, 7, 9 (3V3, SDA, SCL, GPIO4 as INT, GND).

## Using the driver
```python
from machine import I2C, Pin
from rgbpot import RGBPotentiometer
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
pot = RGBPotentiometer(i2c)          # checks chip ID, sets up the track, ADC and LED PWM
raw = pot.read_raw()                 # 0-4095
pot.set_led(255 - raw // 16, raw // 16, 0)
print('pot=%d (%d%%)' % (raw, round(raw * 100 / 4095)))
```

## Gotchas
- Reading 0 or a random value: the track-end pins were not driven (call the driver's init, or set pins 12 and 3 as outputs yourself).
- "chip ID" error: wrong address (someone changed it) or missing pull-ups.
- The Pimoroni Python example and the C++ library drive the track ends opposite ways; `clockwise=False` reverses the direction.
- In Sparkbench's simulator the ADC conversion finishes instantly and the LED colour is not shown.

## Datasheet
- MS51 Technical Reference Manual: https://cdn.shopify.com/s/files/1/0174/1800/files/TRM_MS51_16KBFlash_Series_EN_Rev1.03.pdf?v=1601027378
- Firmware register map: https://github.com/pimoroni/ioe-python/blob/master/ioexpander/ioe_regs.py
