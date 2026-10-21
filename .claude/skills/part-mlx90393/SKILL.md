---
name: part-mlx90393
description: Pinout, electrical limits, wiring and MicroPython driver for the MLX90393 3-axis magnetometer (Melexis MLX90393). Use when designing, wiring, simulating or writing code for an MLX90393 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MLX90393 3-axis magnetometer (MLX90393)

## Overview
The **MLX90393** from Melexis measures the magnetic field on X, Y and Z (16 bits per axis, ±5 to ±50 mT depending on gain) plus its own temperature. It talks I2C (or SPI, unused here). It has a much wider range than a compass chip, so it is good for sensing magnets, not the Earth's field. Hobbyists buy it as the **Adafruit Wide-Range Triple-axis Magnetometer - MLX90393 (product 4022)**, which adds a 3.3 V regulator, I2C level shifting and pull-ups, and STEMMA QT connectors.

## Pinout (Adafruit 4022, bottom header, left to right)
| Pin | Function |
|---|---|
| VIN | Supply input, 3–5 V (sets the SDA/SCL logic level) |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL | I2C clock (pull-up on board) |
| SDA | I2C data (pull-up on board) |
| INT | Data-ready interrupt, 3.3 V logic (optional) |

## Pinout (Adafruit 4022, top row, left to right; normally left unsoldered)
| Pin | Function |
|---|---|
| A0 | I2C address bit 0 (pulled low = 0x0C) |
| A1 | I2C address bit 1 (pulled low) |
| CS | Chip select / SENB, I2C-SPI mode test pad, leave unconnected |
| TR | INT/TRG trigger pin of the chip, 3.3 V logic (optional) |
| MIS | SPI MISO test pad (SPI not supported on this board), leave unconnected |
| G | Extra ground |

The two rows sit on opposite edges of the board, 0.5" (12.7 mm) apart, so the module is wired with jumper leads in the project (only the bottom row is needed).

## Electrical limits
- Chip: VDD 2.2–3.6 V. Board VIN: 3–5 V through the regulator.
- Current: about 2.3–3 mA while converting, a few µA idle.
- I2C up to 400 kHz. Only SDA/SCL are 5 V safe; INT is 3.3 V.

## Interface details
- **I2C address 0x0C** (A0 = A1 = low); 0x0D–0x0F with A0/A1 high.
- Every command returns a **status byte** first; bit 4 (0x10) = ERROR (command rejected).
- Commands: EX 0x80, RT 0xF0, SM 0x3F (single measurement of T, X, Y, Z), RM 0x4F (read status + T, X, Y, Z, 16 bits each, MSB first), RR 0x50 reg<<2, WR 0x60 D15..8 D7..0 reg<<2.
- The power-on filter settings (OSR = 0, DIG_FILT = 0) are not permitted with HALLCONF = 0xC: write register 0x02 first (driver uses OSR = 0, DIG_FILT = 5, about 8 ms per XYZT measurement).
- Sensitivity (HALLCONF = 0xC, GAIN_SEL = 7, RES = 0): X/Y 0.150 µT/LSB, Z 0.242 µT/LSB, signed. Other gains/resolutions: datasheet Table 17 (in the driver).
- Temperature: T = 25 + (raw − 46244) / 45.2 °C.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from mlx90393 import MLX90393
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
x, y, z, t = MLX90393(i2c).read()
print('X=%.1f Y=%.1f Z=%.1f uT T=%.1fC' % (x, y, z, t))
```

## Gotchas
- The Earth's field is only about 25–65 µT, so the reading is never exactly zero, and a fridge magnet up close saturates the default gain (about ±4.9 mT on X/Y): lower `gain` for strong magnets.
- Iron screws, the breadboard's metal clips and current-carrying wires nearby shift the reading.
- An ERROR status after RM usually means the measurement was read before it finished, or a loose SDA/SCL wire.

## Datasheet
https://www.melexis.com/-/media/files/documents/datasheets/mlx90393-datasheet-melexis.pdf
