---
name: part-ds1307
description: Pinout, electrical limits, wiring and MicroPython driver for the DS1307 real-time clock module (Tiny RTC, DS1307). Use when designing, wiring, simulating or writing code for a DS1307 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS1307 real-time clock module (DS1307)

## Overview
The **DS1307** (Maxim, now Analog Devices) is a battery-backed I2C clock/calendar: seconds, minutes, hours, weekday, date, month and year in BCD, leap years handled to 2100, plus 56 bytes of RAM and a programmable square-wave pin. Hobbyists buy it on the **Tiny RTC I2C module**, which adds a 32.768 kHz crystal, a coin-cell holder, an AT24C32 EEPROM (0x50) and an empty DS18B20 footprint.

## Pinout (Tiny RTC, 7-pin header P1, header order)
| Pin | Function |
|---|---|
| SQ | SQW/OUT: open-drain square wave (1 Hz / 4.096 / 8.192 / 32.768 kHz) or logic output (optional) |
| DS | Data pin of the optional DS18B20 footprint (usually empty, optional) |
| SCL | I2C clock (pull-up to VCC on the module) |
| SDA | I2C data (pull-up to VCC on the module) |
| VCC | Supply, 5 V (4.5–5.5 V) |
| GND | Ground |
| BAT | Backup cell + (leave unconnected) |

The 5-pin header P2 on the other edge repeats DS, SCL, SDA, VCC, GND.

## Electrical limits
- Supply: 4.5–5.5 V. It does **not** run from 3.3 V; below about 1.25 × VBAT it stops answering on I2C.
- Current: 1.5 mA max while talking at 100 kHz, 200 µA standby; about 500 nA from the cell.
- Logic: high ≥ 2.2 V, so 3.3 V logic drives it.
- I2C standard mode only: 100 kHz max.
- Backup cell: 2.0–3.5 V. Without a cell, VBAT must be grounded.

## Interface details
- **I2C address 0x68** (fixed). The module's EEPROM is at 0x50.
- Registers 0x00–0x06 (BCD): seconds (bit 7 = CH, clock halt), minutes, hours (bit 6 = 1: 12-hour mode, bit 5 = PM), weekday 1–7 (user-defined, counts up at midnight), date, month, year 00–99.
- 0x07 control: OUT (bit 7), SQWE (bit 4), RS1:RS0 (00 = 1 Hz … 11 = 32.768 kHz). Power-on value 0x03.
- 0x08–0x3F: 56 bytes of battery-backed RAM. The pointer wraps from 0x3F to 0x00.
- After first power-up the clock reads 2000-01-01 00:00:00 and is **halted** (CH = 1). Writing the seconds with CH = 0 starts it; write all seven time registers in one transfer.

## Wiring
- ESP32: VCC → VIN/5V, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → VBUS (pin 40), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 2 (5 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- The module's pull-ups go to 5 V. ESP32, Pico and Pi pins are not 5 V tolerant: remove the module's two I2C pull-up resistors and pull SDA/SCL up to 3.3 V (4.7 kΩ), or use a level shifter.

## Using the driver
```python
from machine import I2C, Pin
from ds1307 import DS1307
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = DS1307(i2c)
rtc.datetime((2027, 2, 28, 7, 23, 59, 57))   # year, month, day, weekday (1 = Monday), h, m, s
print(rtc.datetime())
```
Also `halted()`, `halt(stop)`, `square_wave(freq)` and `read_ram()/write_ram()`.

## Gotchas
- Time stuck at 00:00:00 or not counting: CH is still set; set the time once.
- The Tiny RTC charges the cell through a diode: fit an LIR2032 rechargeable, or remove the charging parts before using a CR2032.
- No answer at 0x68: VCC is under 4.5 V (e.g. wired to 3.3 V).
- The DS1307 drifts with temperature (plain crystal, no compensation): expect seconds per day; the DS3231 is the accurate alternative.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/DS1307.pdf
