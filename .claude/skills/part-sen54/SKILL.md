---
name: part-sen54
description: Pinout, electrical limits, wiring and MicroPython driver for the Sensirion SEN54 environmental sensor node (PM1.0–PM10, RH, T, VOC Index; SEN54-SDN-T) on the Adafruit SEN54/SEN55 Adapter Breakout (5964), over I2C. Use when designing, wiring, simulating or writing code for a SEN54 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SEN54 environmental sensor node (SEN54-SDN-T)

## Overview
The **Sensirion SEN54** combines a laser-scattering particulate matter sensor with a fan (PM1.0, PM2.5, PM4.0, PM10, 0–1000 µg/m³), a humidity/temperature sensor and a VOC sensor that outputs a **VOC Index** (1–500). Unlike the SEN55 it has **no NOx sensor**. It updates once per second over I2C (address 0x69). The sensor needs 5 V and has a 1.25 mm GH connector, so hobbyists plug it into the **Adafruit SEN54 or SEN55 Adapter Breakout (product 5964)** with a 6-pin JST GH cable. The adapter has a charge pump that makes the 5 V, 10 kΩ I2C pull-ups, SEL tied to GND, STEMMA QT sockets and a 4-pin header.

## Pinout (Adafruit 5964 header, left to right)
| Pin | Function |
|---|---|
| VIN | Adapter supply, 3–5 V (same as your logic level) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up on board) |
| SDA | I2C data (10 kΩ pull-up on board) |

The sensor-side GH cable carries VDD (5 V from the pump), GND, SDA, SCL, SEL (to GND on the adapter) and NC.

## Electrical limits
- Sensor: 4.5–5.5 V, 70 mA typ / 100 mA max in the first 60 s of measurement, 63 mA after, 110 mA peaks; 6.5 mA in RHT/gas-only mode; 0.7 mA idle.
- Adapter: AP3602A charge pump (input 2.7–5 V recommended, 100 mA output). From 3.3 V expect roughly twice the sensor current, about 150 mA.
- Start-up: wait 50 ms after power-on before the first I2C transfer.
- I2C standard mode only (100 kHz), no clock stretching.

## Interface details
- **I2C address 0x69.** Commands are 16-bit pointers sent MSB first with no CRC; every 2 data bytes written or read are followed by a CRC-8 (poly 0x31, init 0xFF; CRC(0xBEEF) = 0x92).
- Start measurement `00 21` (< 50 ms); RHT/gas-only mode `00 37`; stop `01 04` (< 200 ms).
- Data-ready: write `02 02`, wait 20 ms, read `00 flag CRC` (flag 1 = new data, each second).
- Read measured values: write `03 C4`, **wait 20 ms**, read 24 bytes = 8 words, each `MSB LSB CRC`:
  PM1.0, PM2.5, PM4.0, PM10 (uint16 ÷ 10, µg/m³), RH (int16 ÷ 100, %), T (int16 ÷ 200, °C), VOC Index (int16 ÷ 10), NOx Index (always unknown on the SEN54).
  Unknown reads 0xFFFF per the datasheet; Sensirion's driver documents 0x7FFF for int16 fields. The driver returns `None` for both.
- Fan cleaning `56 07`, device status `D2 06`, reset `D3 04` (100 ms). Product name `D0 14` returns "SEN54".

## Wiring
- ESP32: VIN → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VIN → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Or use a STEMMA QT / Qwiic cable.

## Using the driver
```python
from machine import I2C, Pin
from sen54 import SEN54
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = SEN54(i2c)
s.start()
m = s.read()          # waits for the data-ready flag
print(m['pm2_5'], m['humidity'], m['temperature'], m['voc_index'])
```

## Gotchas
- `nox_index` is always `None` on the SEN54. Buy a SEN55 if you need NOx.
- The VOC Index takes minutes to settle (starts at 100 = typical air). PM settles after ~30 s.
- The fan draws real current: a weak 3.3 V regulator or a long thin USB cable can brown out. Power VIN from 5 V on a 5 V board.
- A CRC mismatch nearly always means long wires or a bus faster than 100 kHz.
- Keep the metal shield floating: it is tied to GND internally.
- The adapter does not come with the GH cable or the sensor.

## Datasheet
https://sensirion.com/media/documents/6791EFA0/62A1F68F/Sensirion_Datasheet_Environmental_Node_SEN5x.pdf
