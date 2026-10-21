---
name: part-mlx90614
description: Pinout, electrical limits, wiring and MicroPython driver for the MLX90614 infrared (non-contact) thermometer (Melexis MLX90614, GY-906 module). Use when designing, wiring, simulating or writing code for an MLX90614 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MLX90614 infrared thermometer (MLX90614)

## Overview
The **MLX90614** from Melexis measures the temperature of whatever it is pointed at, without touching it (object −70 to 380 °C), plus its own package temperature (−40 to 125 °C), both at 0.02 °C resolution and ±0.5 °C around room temperature. It talks SMBus, which works with I2C. Hobbyists buy it on the **GY-906 module**: an MLX90614ESF-BAA (3 V version) with a 662K 3.3 V regulator and pull-ups on SDA/SCL, so it runs on 3.3–5 V.

## Pinout (GY-906 module, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (regulated to 3.3 V on the board) |
| GND | Ground |
| SCL | SMBus/I2C clock |
| SDA | SMBus/I2C data (also the PWM output if the chip is reprogrammed to PWM mode) |

## Electrical limits
- Chip (BAA, 3 V version): 2.6–3.6 V; the GY-906 regulator lets VIN be 3.3–5 V (regulator max 6 V).
- Current: about 1.5–2 mA.
- SMBus clock **10–100 kHz only** – do not run the bus at 400 kHz.

## Interface details
- **I2C address 0x5A** (programmable in EEPROM; the factory default is 0x5A).
- SMBus read word: write the command byte (RAM address), **repeated START**, read LSByte, MSByte, then an optional PEC byte (CRC-8, poly 0x07). The datasheet example: read RAM 0x07 returns 0xD2, 0x3A, PEC 0x30, so the word is 0x3AD2.
- RAM 0x06 = Ta (sensor temperature), 0x07 = Tobj1 (object), 0x08 = Tobj2 (dual-zone parts only).
- **T = raw × 0.02 − 273.15 °C**. Bit 15 set = error flag. Example: 0x3AF7 → 28.75 °C. Range 0x27AD (−70.01 °C) to 0x7FFF (382.19 °C).

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5. Set the Pi's I2C to 100 kHz or slower.

## Using the driver
```python
from machine import I2C, Pin
from mlx90614 import MLX90614
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = MLX90614(i2c)
print('Obj=%.1fC Amb=%.1fC' % (s.object(), s.ambient()))
```
The driver reads the two data bytes and checks the error flag. It does not read the PEC byte, which SMBus lets the master skip. The simulator does not produce the PEC byte either.

## Gotchas
- Bus faster than 100 kHz gives garbage or `OSError`. Always pass `freq=100000`.
- The chip needs a proper repeated START. `readfrom_mem` sends one; a separate `writeto` and `readfrom` does not.
- Continuous polling disturbs the reading, because SCL runs close to the sensor input. Read about once per second.
- It measures the average over its field of view (about 90° on the BAA). Get close for a small object, and expect shiny metal to read low because of its low emissivity.
- On 5 V chip versions SCL undershoots, which may upset other chips on the same bus. This does not apply to the 3 V BAA on the GY-906.

## Datasheet
https://www.melexis.com/-/media/files/documents/datasheets/mlx90614-datasheet-melexis.pdf
