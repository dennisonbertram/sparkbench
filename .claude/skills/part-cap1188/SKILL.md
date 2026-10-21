---
name: part-cap1188
description: Pinout, electrical limits, wiring and MicroPython driver for the CAP1188 8-key capacitive touch breakout (Microchip CAP1188, Adafruit #1602, I2C 0x29 / SPI, 8 LED drivers). Use when designing, wiring, simulating or writing code for a CAP1188 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# CAP1188 8-key capacitive touch breakout (CAP1188)

## Overview
The **CAP1188** (Microchip, ex-SMSC) senses eight capacitive touch inputs (CS1–CS8) with automatic
recalibration and programmable sensitivity, and has eight LED drivers that can follow the touches.
On the **Adafruit CAP1188 8-Key Capacitive Touch Sensor Breakout (#1602)** each channel has an LED,
there is a 3.3 V regulator, and the chip talks **I2C (default 0x29)** or SPI depending on the AD pin.
- Touch status: register **0x03**, bit 0 = C1 … bit 7 = C8.
- Status bits **latch** until the INT bit (0x00 bit 0) is written to 0; held touches stay set.
- Default **multiple-touch blocking** (0x2A = 0x80) reports only one pad; write 0x2A = 0x00 for all.
- IDs: 0xFD = 0x50 (product), 0xFE = 0x5D (Microchip), 0xFF = revision (0x83).

## Pinout (two 13-pin headers, as printed)
Left header, top to bottom:
| Pin | Function |
|---|---|
| SDA | I2C data (SPI MISO), 10k pull-up to 3.3 V |
| SCK | I2C clock SCL (SPI clock), 10k pull-up to 3.3 V |
| VIN | Supply 3.3–5 V (regulated to 3.3 V on board) |
| GND | Ground |
| L1–L8 | LED driver outputs (on-board LEDs already fitted) |
| IRQ | Interrupt, active low, 10k pull-up |

Right header, top to bottom:
| Pin | Function |
|---|---|
| MOSI | SPI MOSI / WAKE output (unused for I2C) |
| CS | SPI chip select (unused for I2C) |
| RST | Reset, active HIGH, 10k pull-down |
| 3Vo | 3.3 V regulator output |
| C1–C8 | Touch sensor inputs |
| AD | Address/protocol: open = 0x29, to 3Vo = 0x28, to GND = SPI |

## Electrical limits
- Chip VDD 3.0–3.6 V (abs. max 4 V); board VIN 3.3–5 V. Chip ~0.5 mA active, plus ~3 mA per lit LED.
- SDA, SCK, IRQ, CS, MOSI are 5 V tolerant (max 5.5 V); the board pulls SDA/SCK up to 3.3 V.
- Touch pads: base capacitance up to 50 pF, touch shift 0.1–2 pF.
- Timing: no bus response for up to 15 ms after power-up; first conversion after 170–200 ms.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → GPIO21, SCK → GPIO22. Pads → C1…C8.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCK → GP5 (I2C0).
- Raspberry Pi 4: VIN → pin 1, GND → pin 6, SDA → pin 3, SCK → pin 5.
- Optional: IRQ → a GPIO (falling edge on touch); RST → a GPIO for hardware reset.

## Using the driver
```python
from machine import I2C, Pin
from cap1188 import CAP1188
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
cap = CAP1188(i2c)            # 0x29; checks product/maker ID, enables multi-touch, links LEDs
print(cap.touched_pads())     # e.g. [2, 7]
```
`touched()` returns the 8-bit mask and clears INT; `delta(n)` reads a pad's signed delta count;
`set_sensitivity(0..7)` (0 = most sensitive, default 2); `set_gain(0..3)`.

## Gotchas
- The clock pin is printed **SCK**, not SCL.
- Don't ground AD for I2C: that selects 4-wire SPI.
- Without writing 0x2A = 0 only the first touched pad (CS1→CS8 order) is reported.
- A released pad stays reported until INT is cleared (the driver does this on every read).
- Don't touch the pads at power-up; the chip calibrates against what it sees.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/00001620C.pdf
