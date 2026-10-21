---
name: part-gp2y0e03
description: Pinout, electrical limits, wiring and MicroPython driver for the Sharp GP2Y0E03 I2C + analog infrared distance sensor (4-50 cm, 7-pin JST cable). Use when designing, wiring, simulating or writing code for a GP2Y0E03 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Sharp GP2Y0E03 I2C IR distance sensor (GP2Y0E03)

## Overview
The **Sharp GP2Y0E03** measures distance by triangulation (IR LED + CMOS image sensor) from 4 to 50 cm. It gives a
12-bit distance over I2C and an analog voltage on Vout(A). Hobbyists buy the bare Sharp sensor board (11 x 16.7 mm)
with a 7-pin 1.25 mm JST connector and cable; it is not breadboard-pitch, so wire the cable leads to a header.

## Pinout (connector order, Sharp application note Table.02)
| # | Pin | Function |
|---|---|---|
| 1 | VDD | Sensor supply 2.7-5.5 V |
| 2 | Vout(A) | Analog output (optional): ~2.2 V at 4 cm, ~2.0 V at 10 cm, ~0.55 V at 50 cm, nonlinear |
| 3 | GND | Ground |
| 4 | VIN(IO) | I/O supply: sets the SDA/SCL/GPIO1 logic level, keep below 3.6 V |
| 5 | GPIO1 | High = active (measuring), low = stand-by |
| 6 | SCL | I2C clock (open drain) |
| 7 | SDA | I2C data (open drain) |

## Electrical limits
- VDD 2.7-5.5 V; VDD and VIN(IO) may share one supply only up to 3.3 V. With VDD at 5 V, VIN(IO) needs its own supply below 3.6 V. Simplest: both on 3.3 V.
- Current 26 mA average, 36 mA max; stand-by 20-60 uA.
- I2C up to 400 kHz; no pull-ups on the sensor, so add 4.7 kOhm to 3.3 V on SDA and SCL.
- Operating temperature -10 to +60 °C. Response time up to 40 ms.

## Interface details
- **I2C address 0x40** (7-bit; Sharp writes 0x80 write / 0x81 read). Can be changed once by E-Fuse programming (16 choices) - do not try this casually, it is permanent.
- GPIO1 must be high; wait >= 500 us after GPIO1 high (or power-up) before the first I2C access.
- Register 0xEF selects the bank (0x00 = bank 0, normal use).
- Distance: read 0x5E (Distance[11:4]) and 0x5F (Distance[3:0], low nibble) - a 2-byte burst read works.
  distance_cm = (Distance[11:4] x 16 + Distance[3:0]) / 16 / 2^n, n = Shift Bit in 0x35 (default 2 = 64 cm full scale, 1/64 cm steps; 1 = 128 cm).
- Other bank-0 registers: 0x3F median filter, 0xA8 signal accumulation, 0x13 max emitting pulse width, 0x03 hold bit.
- Software reset: write 0xEF=0x00, 0xEC=0xEF, 0xEE=0x06, 0xEC=0x7F.

## Wiring
- ESP32: VDD + VIN(IO) -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (4.7 kOhm pull-ups to 3V3), GPIO1 -> D25 (or tie to 3V3).
- Pico: VDD + VIN(IO) -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5 (pull-ups), GPIO1 -> GP2.
- Raspberry Pi 4: VDD + VIN(IO) -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5 (Pi has 1.8 kOhm pull-ups), GPIO1 -> any GPIO or 3.3 V.
- Vout(A) (optional) goes to an ADC pin; it never exceeds about 2.3 V.

## Using the driver
```python
from machine import I2C, Pin
from gp2y0e03 import GP2Y0E03
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
sensor = GP2Y0E03(i2c, gpio1=25)   # drives GPIO1 high
print('D=%.1f cm' % sensor.distance_cm())
```

## Gotchas
- Nothing on the bus at 0x40? GPIO1 is low/floating, or VIN(IO) is not powered.
- Until the first measurement completes the I2C output holds the 64 cm maximum (analog output 0 V).
- Beyond 50 cm the reading is not guaranteed; direct sunlight or lamp light on the detector spoils it.
- The IR LED draws current in pulses; add a 10 uF capacitor across VDD/GND near the sensor.
- Changing the Shift Bit to 128 cm breaks the analog output's scale.

## Datasheet
https://global.sharp/products/device/lineup/data/pdf/datasheet/gp2y0e02_03_appl_e.pdf
