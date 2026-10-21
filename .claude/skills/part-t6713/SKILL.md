---
name: part-t6713
description: Pinout, electrical limits, wiring and MicroPython driver for the Amphenol Telaire T6713 NDIR CO2 sensor module (I2C / Modbus, address 0x15). Use when designing, wiring, simulating or writing code for a T6713 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# T6713 CO2 sensor (Amphenol Telaire T6713)

## Overview
The **Telaire T6713** is an NDIR carbon dioxide sensor module: 0–2000 ppm (T6713-5K: 0–5000 ppm), ±30 ppm ±3 % of reading, a new reading every 5 s. Hobbyists buy the **bare T6713 module** (30 × 20 mm board, six 2.54 mm through-holes in one row, header not included). It speaks Modbus over I2C (or UART), chosen at power-up by pin 6.

## Pinout (T6713 module, connector pins 1–6)
| Pin | Name | Function |
|---|---|---|
| 1 | SDA | I2C data (UART TX). Internal 4.7 kΩ pull-up |
| 2 | SCL | I2C clock (UART RX). Needs an external 4.7 kΩ pull-up |
| 3 | VCC (V+) | Supply 4.5–5.5 V |
| 4 | GND | Ground |
| 5 | PWM | PWM output (25 kHz in I2C mode), optional, needs its own pull-up |
| 6 | CTRL | Interface select: **tie to GND for I2C** (open = UART 19200 8E1). Max 3 V |

## Electrical limits
- Supply 4.5–5.5 V (feed it from the board's 5 V / VBUS pin, not 3.3 V).
- Current: 25 mA average (20 mA typical), 200 mA peaks (155 mA typical). Add a 10–100 µF capacitor at the module.
- I2C works with 3.3 V and 5 V logic; 100 kHz standard mode only; uses clock stretching.
- Abs. max: 7 V on V+, SDA, SCL, PWM; 3 V on CTRL.

## Interface details
- **I2C address 0x15**. Modbus requests without the slave address and without CRC.
- Read CO2 (Read Input Registers, function 4, register 0x138B): write `04 13 8B 00 01`, wait 5–10 ms, read 4 bytes `04 02 MSB LSB`. **ppm = MSB × 256 + LSB** (e.g. 01 9F → 415 ppm).
- Status (register 0x138A): write `04 13 8A 00 01`, read `04 02 MSB LSB`. Bits: 0x0001 error, 0x0002 flash error, 0x0004 calibration error, 0x0400 reboot, 0x0800 warm-up, 0x8000 single-point calibration running.
- Firmware revision: register 0x1389. Reset: write `05 03 E8 FF 00` (no response).
- Reading too soon after the request returns zeros.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, CTRL → GND, SDA → D21, SCL → D22, 4.7 kΩ from SCL to 3V3.
- Pico: VCC → VBUS, GND → GND, CTRL → GND, SDA → GP4, SCL → GP5, 4.7 kΩ from SCL to 3V3(OUT).
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, CTRL → GND, SDA → pin 3, SCL → pin 5 (the Pi has 1.8 kΩ pull-ups already).

## Using the driver
```python
from machine import I2C, Pin
from t6713 import T6713
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
s = T6713(i2c)
print('CO2=%d ppm' % s.co2())
```

## Gotchas
- CTRL must be grounded **before** power-up; changing it later does nothing until the next power cycle.
- No ACK at 0x15 usually means CTRL is floating (UART mode) or the SCL pull-up is missing.
- Readings are rough for the first 2 minutes and fully accurate after 10; check status bit 0x0800.
- ABC Logic self-calibrates to 400 ppm, assuming the sensor sees fresh outdoor air at least once a week. Don't use it in places that never get fresh air, such as greenhouses.
- Use hardware I2C (clock stretching); keep the bus at 100 kHz.

## Datasheet
https://www.amphenol-sensors.com/hubfs/Documents/AAS-916-142A-Telaire-T67xx-CO2-Sensor-022719-web.pdf
