---
name: part-bmp384
description: Pinout, electrical limits, wiring and MicroPython driver for the BMP384 robust barometric pressure & temperature sensor (Bosch BMP384, SparkFun Qwiic SEN-19662). Use when designing, wiring, simulating or writing code for a BMP384 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# BMP384 pressure & temperature sensor (BMP384)

## Overview
The **BMP384** from Bosch Sensortec measures air pressure (300–1250 hPa, ±0.09 hPa relative, ±0.5 hPa absolute) and temperature (−40 to 85 °C, ±0.35 °C at 25 °C). It is the gel-filled, liquid-resistant member of the BMP3xx family and uses the same registers and compensation formulas as the BMP388/BMP390 (chip ID **0x50**). Hobbyists buy it on the **SparkFun Pressure Sensor - BMP384 (Qwiic), SEN-19662**: two Qwiic sockets, a 7-pin 0.1" header, 2.2 kΩ I2C pull-ups (I2C jumper), an ADR jumper and a power LED. There is **no regulator and no level shifting**: it is a 3.3 V-only board.

## Pinout (SparkFun SEN-19662, header order)
| Pin | Printed | Function |
|---|---|---|
| GND | GND | Ground |
| 3V3 | 3V3 | Supply 1.65–3.6 V, straight to the chip |
| SDA | SDI/SDA | I2C data (SPI data in), 2.2 kΩ pull-up |
| SCL | SCK/SCL | I2C clock (SPI clock), 2.2 kΩ pull-up |
| ADR | SDO/ADR | Address select via ADR jumper: 0x77 default (10 kΩ to 3V3), 0x76 (10 kΩ to GND); SPI data out |
| CSB | CSB | SPI chip select, internal 100 kΩ pull-up; leave open for I2C |
| INT | INT | Interrupt output, 3.3 V (optional) |

## Electrical limits
- VDD 1.65–3.6 V (absolute max 3.8 V); interface pins at most VDDIO + 0.3 V. **Never 5 V.**
- Current: 0.7 mA typical (0.8 mA max) peak during pressure measurement, 2 µA asleep (plus the power LED, about 1 mA, unless the LED jumper is cut).
- Start-up time 2 ms.

## Interface details
- **I2C address 0x77** (ADR jumper default); 0x76 with the jumper moved to the GND side.
- Chip ID: register 0x00 = **0x50** (same as BMP388; BMP390 reads 0x60).
- Soft reset: write 0xB6 to CMD (0x7E) when STATUS (0x03) bit 4 cmd_rdy is set.
- Configure OSR (0x1C: osr_p bits 2:0, osr_t bits 5:3), ODR (0x1D), CONFIG (0x1F, IIR filter).
- Forced measurement: write **0x13** to PWR_CTRL (0x1B: press_en, temp_en, mode 01). Conversion time = 234 + (392 + 2^osr_p × 2000) + (313 + 2^osr_t × 2000) µs (about 19 ms at ×8/×1). Wait for STATUS bits 5 and 6 (drdy_press, drdy_temp).
- Burst-read 6 bytes from 0x04: pressure XLSB, LSB, MSB, then temperature XLSB, LSB, MSB (24-bit unsigned, **little-endian**).
- Calibration: 21 bytes at 0x31–0x45 (NVM_PAR_T1…NVM_PAR_P11, table 23). Convert them with datasheet section 9.1 (PAR_T1 = NVM_PAR_T1 × 2⁸, PAR_T2 = NVM_PAR_T2 / 2³⁰, PAR_T3 = NVM_PAR_T3 / 2⁴⁸, PAR_P1 = (NVM_PAR_P1 − 2¹⁴) / 2²⁰, PAR_P2 = (NVM_PAR_P2 − 2¹⁴) / 2²⁹, PAR_P5 = NVM_PAR_P5 × 8, …).
- Temperature (9.2): t_lin = (T_raw − PAR_T1) × PAR_T2 + (T_raw − PAR_T1)² × PAR_T3 °C.
- Pressure (9.3, Pa): P5 + P6·t + P7·t² + P8·t³ + P_raw·(P1 + P2·t + P3·t² + P4·t³) + P_raw²·(P9 + P10·t) + P_raw³·P11, with t = t_lin.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Leave ADR, CSB and INT unconnected for basic I2C use (address 0x77). Or just use a Qwiic / STEMMA QT cable.

## Using the driver
```python
from machine import I2C, Pin
from bmp384 import BMP384
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = BMP384(i2c, addr=0x77)
t, p = sensor.read()
print('T=%.2fC P=%.2fhPa' % (t, p))
print('Altitude %.1f m' % sensor.altitude(1013.25))
```

## Gotchas
- `OSError: ENODEV` / chip-ID error: check the address (0x77 default on SparkFun, 0x76 with the ADR jumper changed). Chip ID 0x60 means a BMP390, which works with the same code if you accept 0x60.
- 3.3 V only: powering the SparkFun board from 5 V, or wiring it to 5 V Arduino I/O without a level shifter, kills it.
- Do not drive CSB low: one falling edge switches the chip into SPI mode until it is power-cycled.
- Data registers are little-endian (XLSB first), unlike the BMP280's big-endian layout: BMP280 code gives nonsense here.
- Always compute temperature before pressure (pressure uses t_lin).
- For altitude, pass today's sea-level pressure from a local weather report; the default 1013.25 hPa can be off by tens of metres.

## Datasheet
https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp384-ds003.pdf
