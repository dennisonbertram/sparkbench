---
name: part-mmc5983ma
description: Pinout, electrical limits, wiring and MicroPython driver for the MMC5983MA 3-axis magnetometer (MEMSIC MMC5983MA, SparkFun Qwiic SEN-19034). Use when designing, wiring, simulating or writing code for an MMC5983MA in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MMC5983MA 3-axis magnetometer (MMC5983MA)

## Overview
The **MMC5983MA** from MEMSIC is a 3-axis AMR magnetic sensor: ±8 G on each axis, 18-bit output (16384 counts/G, 0.0625 mG), 0.4 mG RMS noise, on-chip SET/RESET degaussing and a die temperature sensor. It talks I2C (fast mode, 400 kHz) at fixed address **0x30**, or SPI up to 10 MHz. Hobbyists buy it on the **SparkFun Triple Axis Magnetometer - MMC5983MA (Qwiic), SparkX SEN-19034**: two Qwiic connectors, two 0.1" headers, 2.2k I2C pull-ups and a power LED, but **no regulator** (3.3 V only).

## Pinout (SparkFun SEN-19034, header by header)
Top header (J3):
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Supply, 2.8–3.6 V (straight to the chip, never 5 V) |
| SCL | I2C clock (2.2k pull-up on board) |
| SDA | I2C data (2.2k pull-up on board) |
| INT | Interrupt out, active high, hi-Z until enabled (optional) |

Bottom header (J4):
| Pin | Function |
|---|---|
| GND | Ground |
| 3.3V | Same 3.3 V net |
| COPI | SPI data in (same net as SDA) |
| CIPO | SPI data out |
| SCK | SPI clock (same net as SCL) |
| CS | SPI chip select, pulled high on the board (I2C mode) |

## Electrical limits
- VDD and VDDIO 2.8–3.6 V, absolute max 3.6 V. The SparkFun board has no regulator: 3.3 V only.
- Current: 450 µA at 7 measurements/s with BW=00 (scales with measurement rate), 1 µA powered down; plus about 1 mA for the board's power LED.
- Field range ±8 G per axis; a field above 10 G needs a SET/RESET to restore the sensor.
- I2C up to 400 kHz.

## Interface details
- **I2C address 0x30**, Product ID register 0x2F = 0x30.
- One-shot measurement: write 0x08 (SET) to **0x09**, then 0x01 (TM_M) to **0x09**, poll **0x08** bit 0 (Meas_M_Done), read 7 bytes from **0x00**.
- Each axis is 18-bit unsigned: 0x00/0x01 = X[17:10], X[9:2]; 0x02/0x03 = Y; 0x04/0x05 = Z; 0x06 bits 7..6/5..4/3..2 = X/Y/Z[1:0].
- Field in gauss = (raw18 − 131072) / 16384 (16-bit mode: (raw16 − 32768) / 4096).
- Temperature: write 0x02 to 0x09, poll 0x08 bit 1, T = −75 + 0.8 × reg 0x07 °C.
- Measurement time 8 / 4 / 2 / 0.5 ms for bandwidth 0–3 (0x0A bits 1..0). Software reset: 0x80 to 0x0A, then wait 10 ms.
- SET = 0x08 to 0x09, RESET = 0x10 to 0x09 (500 ns current pulses, self-clearing).

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a Qwiic / STEMMA QT cable. Leave COPI, CIPO, SCK and CS unconnected for I2C.

## Using the driver
```python
from machine import I2C, Pin
from mmc5983ma import MMC5983MA
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
mag = MMC5983MA(i2c)
x, y, z = mag.read()          # gauss
print('X=%.4fG Y=%.4fG Z=%.4fG T=%.1fC' % (x, y, z, mag.temperature()))
```

## Gotchas
- Never power the board from 5 V: there is no regulator and the chip is rated 3.6 V absolute max.
- The outputs are unsigned with an offset (131072 = zero field in 18-bit mode), not two's complement.
- Its register map differs from the MMC5603 (status at 0x08, control at 0x09/0x0A, ID at 0x2F): drivers are not interchangeable.
- The 2.2k pull-ups are strong; with several Qwiic boards on one bus, cut the I2C jumper on all but one.
- Earth's field is only 0.25–0.65 G: keep the board away from magnets, motors, speakers and steel screws, and calibrate offsets before computing a heading.
- In the Sparkbench simulator the readings have 1/4096 G resolution (register 0x06 reads 0); the real chip gives the full 18 bits.

## Datasheet
https://www.memsic.com/Public/Uploads/uploadfile/files/20220119/MMC5983MADatasheetRevA.pdf
