---
name: part-vl6180x
description: Pinout, electrical limits, wiring and MicroPython driver for the VL6180X time-of-flight proximity & ambient light sensor (VL6180X). Use when designing, wiring, simulating or writing code for a VL6180X in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# VL6180X time-of-flight proximity & light sensor (VL6180X)

## Overview
The **VL6180X** from STMicroelectronics times how long an 850 nm infrared pulse takes to bounce back, giving an absolute distance in millimetres that does not depend on the target's colour. It is made for short range: **0 to about 100 mm** (8-bit result, 0-255 mm; beyond 100 mm depends on the target and lighting). It also has a 16-bit **ambient light sensor** (0.32 lux/count at gain 1 and 100 ms). It talks I2C. Hobbyists buy it on the **Adafruit VL6180X Time of Flight Distance Ranging Sensor - STEMMA QT (#3316)**, which has a 2.8 V regulator, I2C level shifting and pull-ups, so it works from 3-5 V.

## Pinout (Adafruit #3316, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3-5 V (regulated to 2.8 V on the board) |
| GND | Ground |
| SCL | I2C clock |
| SDA | I2C data |
| GPIO | Chip GPIO1: interrupt output, active low on new sample (2.8 V logic, not level shifted, optional) |
| XSHUT | Chip GPIO0/CE: shutdown, active low, pulled up on board (optional) |

The board also has two STEMMA QT / Qwiic connectors carrying the same VIN/GND/SDA/SCL.

## Electrical limits
- Bare chip AVDD: 2.6-3.0 V functional, 2.7-2.9 V optimum, absolute max 3.6 V. The breakout's VIN takes 3-5 V.
- Current: about 14 mA (AVDD) + 8 mA (VCSEL) average while ranging, 38 mA peak; ALS about 0.3 mA; standby < 1 µA.
- I2C up to 400 kHz. Operating temperature -20 to +70 °C.

## Interface details
- **I2C address 0x29** (7-bit), changeable at run time in register 0x212 (lost at power-off).
- **16-bit register addresses**, sent MSB first; multi-byte registers are big-endian.
- 0x000 IDENTIFICATION__MODEL_ID = **0xB4**.
- 0x016 SYSTEM__FRESH_OUT_OF_RESET = 1 after power-up: load the **mandatory SR03 settings** from ST AN4545 (private registers 0x0207... 0x0030), then write 0.
- Range, single shot: wait for bit 0 of 0x04D (device ready), write **0x01 to 0x018**, poll **0x04F** until bits 2:0 = 4, read **0x062** (mm), write 0x07 to 0x015 to clear. Bits 7:4 of 0x04D are the error code (0 = OK, 7 = no target, 11 = low signal, 12-15 = under/overflow).
- Light, single shot: write 0x01 to 0x038, poll 0x04F until bits 5:3 = 4, read 16-bit **0x050**, clear 0x015.
- **lux = 0.32 × count / gain × 100 ms / integration time.** Gain register 0x03F (write 0x46 for gain 1.0; upper nibble must be 0x4), integration period 0x040 (16-bit, 1 code = 1 ms, 0x0063 = 100 ms).

## Wiring
| Breakout | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VIN | 3V3 | 3V3(OUT) pin 36 | 3.3 V pin 1 |
| GND | GND | GND pin 38 | GND pin 6 |
| SDA | GPIO21 | GP4 (pin 6) | GPIO2 SDA pin 3 |
| SCL | GPIO22 | GP5 (pin 7) | GPIO3 SCL pin 5 |
| GPIO | optional input | optional input | optional input |
| XSHUT | optional output | optional output | optional output |

On a Raspberry Pi running Linux, use `adafruit-circuitpython-vl6180x` instead of this MicroPython driver.

## Using the driver
```python
from machine import I2C, Pin
import time
from vl6180x import VL6180X

i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=400000)
sensor = VL6180X(i2c)          # ALS gain 1, 100 ms
while True:
    mm = sensor.range()        # None if the sensor flags an error
    print('Range=%s Light=%.1flux' % ('error %d' % sensor.range_error if mm is None else '%dmm' % mm, sensor.lux()))
    time.sleep(1)
```
`VL6180X(i2c, gain=0..7, integration_ms=1..512)` changes the ALS settings (gain codes: 0 = 20, 1 = 10, 2 = 5, 3 = 2.5, 4 = 1.67, 5 = 1.25, 6 = 1.0, 7 = 40).

## Gotchas
- **Remove the protective film** from the sensor window.
- It is a short-range sensor: for 5 cm to 2 m use a VL53L0X or VL53L1X instead.
- A plain `readfrom_mem(addr, reg, n)` sends an 8-bit register address and will read the wrong registers; send the 16-bit address as two bytes (the driver does).
- Skipping the AN4545 settings still gives numbers, but they are inaccurate.
- The 0.32 lux/count calibration is without cover glass; behind glass, scale it by the ratio of readings with and without the glass.
- The GPIO pin is 2.8 V logic. Read it with a 3.3 V board, not a 5 V one.

## Datasheet
https://www.st.com/resource/en/datasheet/vl6180x.pdf (also AN4545, "VL6180X basic ranging application note")
