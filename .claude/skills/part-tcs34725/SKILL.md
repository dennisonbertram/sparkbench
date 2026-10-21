---
name: part-tcs34725
description: Pinout, electrical limits, wiring and MicroPython driver for the TCS34725 RGB colour sensor (ams/TAOS TCS34725, Adafruit #1334 breakout). Use when designing, wiring, simulating or writing code for a TCS34725 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# TCS34725 RGB colour sensor (TCS34725)

## Overview
The **TCS34725** (ams, formerly TAOS) measures light through four photodiode channels: clear, red, green and blue, each with an on-chip IR-blocking filter. Each channel is a 16-bit ADC count; integration time (2.4–614 ms) and gain (1×, 4×, 16×, 60×) are adjustable. It talks I2C at the fixed address 0x29. Hobbyists buy it on the **Adafruit TCS34725 RGB Color Sensor breakout (#1334)** or the purple clones that copy it: a 3.3 V regulator, BSS138 level shifters with 10 k pull-ups on SDA/SCL, and a white illumination LED.

## Pinout (Adafruit #1334, header order, pin 1 = VIN)
| Pin | Function |
|---|---|
| VIN | Board supply, 3.3–5 V |
| GND | Ground |
| 3V3 | 3.3 V OUTPUT of the regulator; not an input, leave unconnected |
| SCL | I2C clock (level-shifted, 5 V safe) |
| SDA | I2C data (level-shifted, 5 V safe) |
| INT | Interrupt, open-drain, active low, 3.3 V logic, no pull-up (optional) |
| LED | White LED enable, pulled up (LED on); pull low to switch the LED off (optional) |

## Electrical limits
- Chip supply 2.7–3.6 V (absolute max 3.8 V); the breakout's regulator takes 3.3–5 V on VIN.
- Chip current about 0.235 mA while measuring, 2.5 µA asleep; the white LED adds a few mA.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x29**, fixed: one sensor per bus.
- Every access starts with a COMMAND byte: bit 7 = 1, bits 6:5 = 00 (repeated byte) or 01 (auto-increment), bits 4:0 = register. So ENABLE is 0x80, ATIME 0x81, CONTROL 0x8F, ID 0x92, STATUS 0x93, and the data block is read from **0xB4** (0xA0 | 0x14).
- ID register reads **0x44** (TCS34725) or 0x4D (TCS34727, found on some clones).
- Start-up: ENABLE = 0x01 (PON), wait ≥ 2.4 ms, ENABLE = 0x03 (PON + AEN).
- Integration time = 2.4 ms × (256 − ATIME). Max count = 1024 × (256 − ATIME), capped at 65535 (ATIME ≤ 0xC0 gives the full range).
- CONTROL bits 1:0: 00 = 1×, 01 = 4×, 10 = 16×, 11 = 60× gain.
- STATUS bit 0 (AVALID) is set once an integration has finished.
- Data: 8 bytes from 0xB4 in one read: CDATA, RDATA, GDATA, BDATA, each low byte first. Reading the low byte latches the high byte into a shadow register, so read them together.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Optional: LED → a GPIO (drive low for LED off), INT → a GPIO with a pull-up.

## Using the driver
```python
from machine import I2C, Pin
from tcs34725 import TCS34725
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = TCS34725(i2c)          # ATIME 0xC0 (153.6 ms), gain 4x
c, r, g, b = sensor.read_raw()
print('C=%d R=%d G=%d B=%d' % (c, r, g, b))
```

## Gotchas
- Forgetting the 0x80 command bit is the classic bug: the chip ignores the register number without it.
- If clear reads at the maximum count (`sensor.saturated(c)`), lower the gain or ATIME.
- The on-board LED lights the target for reflective colour sensing; switch it off (LED low) to measure ambient light.
- Counts are raw: colour ratios (r/c, g/c, b/c) are more robust than absolute values. Lux and colour temperature need the calibration from the ams application notes.

## Datasheet
https://cdn-shop.adafruit.com/datasheets/TCS34725.pdf
