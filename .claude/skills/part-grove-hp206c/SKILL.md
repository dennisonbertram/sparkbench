---
name: part-grove-hp206c
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Barometer (High-Accuracy) with the HopeRF HP206C pressure / altitude / temperature sensor (I2C 0x76). Use when designing, wiring, simulating or writing code for a Grove HP206C barometer in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove Barometer HP206C (High-Accuracy)

## Overview
The **HP206C** from HopeRF is a MEMS barometer with a 24-bit ADC and on-chip compensation. It is driven by single-byte I2C commands, not a register pointer, and returns compensated pressure (0.01 mbar steps, calibrated 700–1100 mbar, ±1.5 mbar), temperature (0.01 °C) and altitude (0.01 m). Hobbyists buy it as the **Seeed Grove - Barometer (High-Accuracy) v1.0**. The board has an XC6206 3.3 V regulator and a 2N7002 MOSFET I2C level shifter with 10 kΩ pull-ups to VCC. (Newer boards sold under the same name use the HP206F.)

## Pinout (Grove connector, Seeed schematic J1)
| Pin | Name | Function |
|---|---|---|
| 1 (yellow) | SCL | I2C clock, 10 kΩ pull-up to VCC |
| 2 (white) | SDA | I2C data, 10 kΩ pull-up to VCC |
| 3 (red) | VCC | Supply 3.3–5 V (regulated to 3.3 V on board) |
| 4 (black) | GND | Ground |

The INT1 pad next to the connector is the chip's interrupt output (optional).

## Electrical limits
- Chip: 1.8–3.6 V (absolute max 3.6 V). The board takes 3.3–5 V through its regulator.
- Current: 1.3 mA peak during a conversion, 0.1 µA standby (plus the regulator and pull-ups).
- I2C up to 400 kHz with 10 kΩ pull-ups.
- **Feed VCC from 3.3 V on ESP32/Pico**: the SDA/SCL pull-ups go to VCC, so a 5 V VCC would pull the GPIOs to 5 V.

## Interface details
- **I2C address 0x76** (CSB high on the Grove board; 0x77 with CSB low).
- Commands: SOFT_RST 0x06, ADC_CVT `010 dsr chnl`, READ_PT 0x10, READ_AT 0x11, READ_P 0x30, READ_A 0x31, READ_T 0x32, ANA_CAL 0x28, READ_REG `10 addr`, WRITE_REG `11 addr`.
- ADC_CVT: DSR 000 = 4096 … 101 = 128; CHNL 00 = pressure + temperature, 10 = temperature only. Example: 0x48 = DSR 1024, P+T.
- Conversion time (P+T): 131.1 / 65.6 / 32.8 / 16.4 / 8.2 / 4.1 ms for DSR 4096 … 128 (half that for temperature only).
- READ_PT returns 6 bytes: temperature (24-bit) then pressure (24-bit), MSB first, two's complement. T = raw / 100 °C, P = raw / 100 mbar.
- Registers: INT_SRC 0x0D (bit 6 DEV_RDY = ready for commands), PARA 0x0E (bit 7 CMPS_EN, default 1 = compensated output), ALT_OFF 0x00/0x01 (altitude offset in cm, two's complement).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → GPIO21, SCL → GPIO22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Use a Grove-to-female-jumper cable; the board has a 2 mm Grove socket, not breadboard pins.

## Using the driver
```python
from machine import I2C, Pin
from hp206c import HP206C
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = HP206C(i2c)          # soft reset, waits for DEV_RDY, enables compensation
t, p = sensor.read()          # ADC_CVT 0x48, wait 33 ms, READ_PT
print('T=%.2fC P=%.2fhPa' % (t, p))
```
`sensor.altitude()` returns the chip's own altitude, but first set `sensor.set_altitude_offset(m)` for your local sea-level pressure (see the datasheet's ALT_OFF table).

## Gotchas
- Wait the full conversion time for the DSR you chose before READ_PT. Seeed's Arduino library waits only 25 ms at DSR 1024, which is too short for pressure (32.8 ms).
- Values are signed 24-bit: sign-extend bit 23 (temperatures below 0 °C).
- The simulator models READ_PT/READ_P/READ_T and the ready flag, not the on-chip altitude computation.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Barometer-High-Accuracy/res/HP206C_Datasheet.pdf
