---
name: part-gravity-ozone-sen0321
description: Pinout, electrical limits, wiring and MicroPython driver for the DFRobot Gravity I2C Ozone Sensor (0-10 ppm), SKU SEN0321 (Winsen ZE27-O3 electrochemical cell behind an I2C bridge, 4-pin SDA/SCL/GND/VCC). Use when designing, wiring, simulating or writing code for an ozone / O3 sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Gravity I2C ozone sensor (DFRobot SEN0321)

## Overview
The **DFRobot Gravity: I2C Ozone Sensor (0-10ppm), SEN0321** measures ozone (O3) in air from 0 to 10 ppm with 10 ppb resolution. Inside is a Winsen **ZE27-O3** electrochemical module (UART); an onboard STM8 reads it and presents the concentration as I2C registers. An onboard boost converter and 3 V regulator let it run from 3.3-5.5 V.

## Pinout (Gravity 4-pin I2C connector, schematic P1 order)
| Pin | Function |
|---|---|
| SDA | I2C data (10 kOhm pull-up to VCC on the board) |
| SCL | I2C clock (10 kOhm pull-up to VCC on the board) |
| GND | Ground |
| VCC | Supply 3.3-5.5 V |

## Electrical limits
- Supply: 3.3-5.5 V DC.
- I2C pull-ups (10 kOhm) go to VCC through MOSFET level shifters: power it from **3.3 V** when the bus goes straight to an ESP32 or Pico.
- Range 0-10 ppm, resolution 0.01 ppm; warm-up 3 min, response/recovery <= 90 s.
- Operating -20 to 50 C, 15-95 %RH (no condensation). Cell lifetime > 2 years in air.

## Interface details
- **I2C address 0x70-0x73** from the A0/A1 DIP switch: [0 0] 0x70, [1 0] 0x71, [0 1] 0x72, [1 1] 0x73 (DFRobot's example uses 0x73).
- Registers (DFRobot_OzoneSensor library):
  - 0x03 mode: 0x00 active (cell uploads every second), 0x01 passive.
  - 0x04 request: write 0x01 (passive) or 0x00 (active) before each reading.
  - 0x07/0x08 passive-mode result, 0x09/0x0A active-mode result, high byte first.
- **Ozone (ppb) = high x 256 + low**; ppm = ppb / 1000.
- Sequence as in DFRobot's code: write the request, wait 100 ms, write the register pointer (with STOP), wait 100 ms, read 2 bytes.

## Wiring
- ESP32: VCC -> 3V3, GND -> GND, SDA -> D21, SCL -> D22.
- Pico: VCC -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VCC -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.

## Using the driver
```python
from machine import I2C, Pin
from gravity_ozone import GravityOzone
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = GravityOzone(i2c, addr=0x73)
ppb = sensor.read_ppb()
print('O3=%dppb %.2fppm' % (ppb, ppb / 1000))
```

## Gotchas
- Readings are meaningless for the first ~3 minutes after power-on; average several readings (DFRobot averages up to 100).
- Not found on i2c.scan()? Check the DIP switch address and that VCC is at least 3.3 V.
- Alcohol vapour and other oxidising/reducing gases interfere with the electrochemical cell.
- Ozone is toxic (workplace limits are around 0.1 ppm); ventilate when testing with an ozone generator.

## Datasheet
- Module wiki: https://wiki.dfrobot.com/Gravity_IIC_Ozone_Sensor_%280-10ppm%29%20SKU_SEN0321
- Schematic: https://dfimg.dfrobot.com/wiki/18659/SEN0321_iic-ozone-sensor_schematics_v1.pdf
- ZE27-O3 datasheet: https://dfimg.dfrobot.com/wiki/18659/SEN0321_iic-ozone-sensor_datasheet_v1.pdf
