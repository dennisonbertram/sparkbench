---
name: part-ds3231
description: Pinout, electrical limits, wiring and MicroPython driver for the DS3231 real-time clock module (ZS-042, Maxim/Analog Devices DS3231). Use when designing, wiring, simulating or writing code for a DS3231 RTC in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS3231 real-time clock module (DS3231)

## Overview
The **DS3231** is an I2C real-time clock with a built-in temperature-compensated crystal (±2 ppm from 0 to 40 °C, about a minute a year). It keeps seconds, minutes, hours, day of week, date, month and year (leap years handled to 2100), has two alarms, an INT/SQW output, a 32.768 kHz output and a die thermometer with 0.25 °C steps. Hobbyists buy it as the blue **ZS-042 module**: DS3231, a coin-cell holder (CR2032/LIR2032), an AT24C32 EEPROM and 4.7 kΩ pull-ups on SDA, SCL, SQW and 32K.

## Pinout (ZS-042 module, 6-pin header order)
| Pin | Function |
|---|---|
| 32K | 32.768 kHz output, open-drain (optional) |
| SQW | INT/SQW: alarm interrupt (active low) or square wave, open-drain (optional) |
| SCL | I2C clock |
| SDA | I2C data |
| VCC | Supply, 3.3–5.5 V |
| GND | Ground |

The 4-pin header on the other edge (SCL, SDA, VCC, GND) is a pass-through for chaining more I2C devices.

## Electrical limits
- Chip supply: 2.3–5.5 V (VCC and VBAT); module used at 3.3–5.5 V.
- Current: about 0.2 mA for the chip plus the module's power LED (a few mA).
- I2C up to 400 kHz. Pull-ups on the module go to VCC.

## Interface details
- **I2C address 0x68** (fixed). The module's AT24C32 EEPROM answers at 0x57.
- Registers 00h–06h: seconds, minutes, hours, day (1–7), date, month, year, all BCD. Read them in one burst.
- Hours (02h): bit 6 = 1 selects 12-hour mode (bit 5 = PM); in 24-hour mode bits 5–4 are tens of hours.
- Month (05h): bit 7 = century, toggled when the year rolls over from 99 to 00.
- Control 0Eh (power-up 0x1C), status 0Fh (power-up 0x88). Status bit 7 **OSF** = the oscillator stopped (first power-up, flat battery): the time is invalid until set; write it back as 0.
- Temperature: 11h = signed integer °C, bits 7–6 of 12h = quarter degrees. T = (signed 10-bit value) × 0.25 °C. Updated every 64 s.

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from ds3231 import DS3231
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
rtc = DS3231(i2c)
if rtc.lost_power():
    rtc.set_datetime(2026, 10, 21, 12, 0, 0)  # weekday worked out for you (1 = Monday)
y, mo, d, h, mi, s, wd = rtc.datetime()
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
print('TEMP=%.2fC' % rtc.temperature())
```

## Gotchas
- Power the module from 3.3 V on an ESP32 or Pico: its pull-ups go to VCC, so 5 V on VCC puts 5 V on SDA/SCL.
- The ZS-042 has a charging circuit (200 Ω resistor + 1N4148 diode) for a rechargeable LIR2032. With a plain CR2032, remove the resistor or the diode, or the cell can swell or leak.
- Only call set_datetime() when needed (e.g. when lost_power() is true); setting it at every boot throws away the time it kept.
- The temperature is the chip's own temperature, updated every 64 s, not a precision air sensor.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/DS3231.pdf
