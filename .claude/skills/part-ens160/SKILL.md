---
name: part-ens160
description: Pinout, electrical limits, wiring and MicroPython driver for the ENS160 air quality sensor (ScioSense ENS160, eCO2/TVOC/AQI). Use when designing, wiring, simulating or writing code for an ENS160 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ENS160 air quality sensor (ENS160)

## Overview
The **ENS160** from ScioSense is a metal-oxide (MOX) multi-gas sensor with on-chip algorithms. It reports **equivalent CO2** (400–65,000 ppm), **TVOC** (0–65,000 ppb) and the **UBA air quality index** (1 = excellent … 5 = unhealthy) over I2C or SPI. The chip runs on 1.8 V, so hobbyists use it on a breakout such as the **Adafruit ENS160 MOX Gas Sensor (product 5606)**, which has 1.8 V and 3.3 V regulators, level shifters and 10 kΩ pull-ups, so it works with 3–5 V boards.

## Pinout (Adafruit ENS160 breakout, header order)
| Pin | Function |
|---|---|
| VIN | Supply, 3–5 V |
| 3Vo | 3.3 V regulator output (up to 100 mA), leave unconnected |
| GND | Ground |
| SCL (printed SCK) | I2C clock |
| SDO | Address select: open/high = 0x53, GND = 0x52 (SPI MISO) |
| SDA (printed SDI) | I2C data |
| CS | SPI chip select; leave unconnected (pulled high = I2C mode) |
| INT | Interrupt output (optional) |

## Electrical limits
- Chip: VDD 1.71–1.98 V, VDDIO 1.71–3.6 V (absolute max 1.98 V / 3.6 V). The breakout takes 3–5 V on VIN.
- Current: about 29 mA average in STANDARD mode, 79 mA peaks (< 5 ms) when the heater starts; 2 mA idle, 10 µA deep sleep.
- I2C up to 1 MHz (fast mode plus).

## Interface details
- **I2C address 0x53** (SDO/ADDR high, the Adafruit default) or 0x52 (SDO to GND).
- All multi-byte registers are **little endian** (LSB at the lower address).
- PART_ID 0x00–0x01 reads **0x0160**.
- OPMODE 0x10: 0x00 deep sleep, 0x01 idle (power-up default), **0x02 standard gas sensing**, 0xF0 reset.
- DEVICE_STATUS 0x20: bit 7 STATAS (mode running), bit 6 STATER (error), bits 3:2 validity (0 normal, 1 warm-up, 2 initial start-up, 3 invalid), bit 1 NEWDAT (cleared when data is read).
- DATA_AQI 0x21 (bits 2:0, 1–5), DATA_TVOC 0x22–0x23 (ppb), DATA_ECO2 0x24–0x25 (ppm). One new result per second.
- Compensation: TEMP_IN 0x13 = (°C + 273.15) × 64 (25 °C → 0x4A8A), RH_IN 0x15 = %RH × 512 (50 % → 0x6400); write LSB first.

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA (SDI) → D21, SCL (SCK) → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA (SDI) → GP4, SCL (SCK) → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA (SDI) → pin 3, SCL (SCK) → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ens160 import ENS160
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = ENS160(i2c)            # 0x53; ENS160(i2c, 0x52) with SDO grounded
sensor.set_compensation(22.5, 45)  # optional, from a temperature/humidity sensor
aqi, tvoc, eco2 = sensor.read()
print('AQI=%d TVOC=%dppb eCO2=%dppm' % (aqi, tvoc, eco2), 'validity', sensor.validity)
```

## Gotchas
- Nothing is reported until OPMODE is set to 0x02 (the driver does this).
- After each power-on readings need about 3 minutes of warm-up (validity 1); a brand-new sensor needs 1 hour (validity 2). Don't trust numbers before validity is 0.
- eCO2 is estimated from VOCs and hydrogen, not measured with an NDIR CO2 cell.
- The heater warms the board: keep a temperature/humidity sensor a little away from it.
- The board labels the I2C pins with their SPI names: SCK = SCL, SDI = SDA.

## Datasheet
https://www.sciosense.com/wp-content/uploads/2023/12/ENS160-Datasheet.pdf
