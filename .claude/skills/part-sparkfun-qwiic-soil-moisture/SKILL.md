---
name: part-sparkfun-qwiic-soil-moisture
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Soil Moisture Sensor (SEN-17731, resistive probe read by an ATtiny85 I2C gateway at 0x28). Use when designing, wiring, simulating or writing code for a Qwiic soil moisture sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Soil Moisture Sensor (SEN-17731)

## Overview
A resistive soil probe: two gold-plated (ENIG) pads act as a variable resistor, more water = lower resistance. An **ATtiny85** running the Zio/SparkFun gateway firmware reads the pads with its 10-bit ADC against a **100 kΩ pull-up** to 3.3 V and hands the raw reading over I2C. A green LED can be switched by command; a red LED shows power. Built with Zio (NOA Labs). SparkFun has since retired it in favour of SEN-24409.

## Pinout (Qwiic JST-SH connector, pin 1 to 4)
| Pin | Function |
|---|---|
| GND | Ground (black) |
| 3.3V | Supply, 3.3 V (red) |
| SDA | I2C data (blue), 4.7 kΩ pull-up on the board |
| SCL | I2C clock (yellow), 4.7 kΩ pull-up on the board |

There is no 0.1" signal header, only an unpopulated 2x3 ICSP header (MISO, 3.3V, SCK/SCL, MOSI/SDA, RST, GND) for reprogramming the ATtiny. Use a Qwiic cable, or a Qwiic-to-breadboard (female jumper) cable.

## Electrical limits
- Supply: 3.3 V (ATtiny85 runs from 2.7 V; the Qwiic system is 3.3 V). Do not feed 5 V: the I2C pull-ups would put 5 V on SDA/SCL.
- Current: a few mA (ATtiny85 plus the power LED, about 1 mA more with the green LED on).
- I2C 100/400 kHz.

## Interface details
- **I2C address 0x28**; command 0x03 <addr> stores a new one (0x08-0x77) in EEPROM.
- Not a register map: every write's first byte is a command.
  - 0x00 = LED off, 0x01 = LED on.
  - **0x05 = get value**: then read 2 bytes, **low byte first**: raw = b0 | b1 << 8 (0-1023).
- raw = 1024 × Rprobe / (Rprobe + 100 kΩ), at most 1023. **1023 = dry / in air, lower = wetter.** SparkFun's library: wetness % = (1023 − raw) / 1023 × 100.

## Wiring
- ESP32: 3.3V → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3.3V → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3.3V → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_soil import QwiicSoilMoisture
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
soil = QwiicSoilMoisture(i2c)       # 0x28
raw = soil.read_raw()               # 1023 dry ... lower = wetter
print(raw, soil.read_percent())     # SparkFun-style wetness %
soil.led_on(); soil.led_off()
```
`probe_ohms()` turns the reading back into the pad resistance (None when open).

## Gotchas
- The value is relative, not volumetric water content: calibrate dry and freshly watered readings in your own soil.
- DC through wet soil corrodes the pads over time; the gold finish helps, but don't leave it in soil for years expecting stable numbers.
- Keep the electronics end out of the soil and coat it (conformal coating / hot glue) if outdoors.
- Several Qwiic boards each add pull-ups; cut JP3 on some if the bus gets too strong.
- In the Sparkbench simulator the slider is the raw ADC reading directly.

## Datasheet
Schematic https://cdn.sparkfun.com/assets/d/e/4/b/b/17731-QwiicSoilMoistureSensor-Schematic.pdf, firmware https://github.com/sparkfun/Zio-Qwiic-Soil-Moisture-Sensor (Qwiic_Soil_Moisture_Firmware.ino), ATtiny85 https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf
