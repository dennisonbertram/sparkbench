---
name: part-pcf85063a
description: Pinout, electrical limits, wiring and MicroPython driver for the PCF85063A real-time clock breakout (NXP PCF85063A, Soldered 333051 board). Use when designing, wiring, simulating or writing code for a PCF85063A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCF85063A real-time clock breakout (PCF85063A)

## Overview
The **PCF85063A** from NXP is a low-power real-time clock/calendar: seconds, minutes, hours, day, weekday, month and year in BCD, automatic leap years, an alarm, a countdown timer, minute/half-minute interrupts, an offset register for fine-tuning, one free RAM byte and a programmable CLKOUT square wave. It talks I2C at up to 400 kHz at the fixed address **0x51**. The board modelled here is the **Soldered Electronics "Real time clock RTC PCF85063A breakout" (SKU 333051)**: 3.3 V regulator, MOSFET I2C level shifter with 10 kOhm pull-ups, 32.768 kHz crystal, CR2032 holder (battery not included) and two easyC/Qwiic connectors.

## Pinout (Soldered 333051, as printed on the board)
Two headers on opposite edges, so the board is wired with jumper leads.

| Header | Pin | Function |
|---|---|---|
| 4-pin | SCL | I2C clock (10 kOhm pull-up to VCC on board) |
| 4-pin | SDA | I2C data (10 kOhm pull-up to VCC on board) |
| 4-pin | VCC | Supply 3.3-5 V (feeds the 3.3 V regulator and the I2C pull-ups) |
| 4-pin | GND | Ground |
| 3-pin | CLK-OE | CLKOUT enable input, pulled HIGH on board (optional) |
| 3-pin | CLK-OUT | Square-wave output, push-pull, 32.768 kHz at power-on (optional) |
| 3-pin | INT | Alarm/timer interrupt, open-drain, active LOW, 10 kOhm pull-up on board (optional) |

## Electrical limits
- Chip: 0.9-5.5 V timekeeping, 1.8-5.5 V with I2C active; absolute max 6.5 V.
- Board VCC: 3.3 V or 5 V (regulator SE5218 to 3.3 V, then a diode OR with the coin cell). Modelled range 3.3-5.5 V (Soldered: "both 5V and 3V3 are supported").
- Current: chip about 0.22 uA timekeeping (CLKOUT off), 18 uA with I2C at 400 kHz; the regulator and CLKOUT add a little.
- The header I2C pull-ups go to VCC: with a 3.3 V board (ESP32, Pico) power VCC from 3.3 V, never 5 V.

## Interface details
- **I2C address 0x51** (A2h write / A3h read), fixed.
- 00h Control_1: EXT_TEST (7), STOP (5), SR (4), CIE (2), 12_24 (1, 0 = 24 h), CAP_SEL (0, 0 = 7 pF). Writing 58h = software reset.
- 01h Control_2: AIE (7), AF (6, write 0 clears, write 1 leaves unchanged), MI (5), HMI (4), TF (3), COF[2:0] (CLKOUT: 000 32768, 001 16384, 010 8192, 011 4096, 100 2048, 101 1024, 110 1 Hz, 111 off/LOW).
- 02h Offset, 03h RAM byte.
- **04h-0Ah time**: seconds (bit 7 = OS oscillator-stop flag), minutes, hours, days, weekdays (0 = Sunday ... 6 = Saturday), months (1-12, no century bit), years 00-99. Day comes **before** weekday, like the PCF8563 (unlike DS1307/DS3231), but the block starts at 04h, not 02h.
- 0Bh-0Fh alarms (bit 7 AEN_x = 1 disables a field), 10h timer value, 11h timer mode.
- Address pointer auto-increments; read or write 04h-0Ah in one access finished within 1 s.

## Wiring
- ESP32: VCC -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (pull-ups are on the board).
- Pico: VCC -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VCC -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Or plug a Qwiic/easyC cable into either connector (3.3 V side of the level shifter).

## Using the driver
```python
from machine import I2C, Pin
from pcf85063a import PCF85063A
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = PCF85063A(i2c)
if rtc.lost_power():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 0 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
rtc.clkout(0)  # switch CLKOUT off to save current
```

## Gotchas
- Not a drop-in for PCF8563 code: the time registers start at **04h** (PCF8563: 02h), CLKOUT codes differ and the alarm flag is in Control_2 bit 6.
- The weekday register is not computed by the chip; the driver works it out from the date when you set the time.
- Years are 2000-2099 (no century bit); the chip treats every year divisible by 4 as a leap year.
- OS reads 1 for 200 ms-2 s after power-up while the crystal starts; if it cannot be cleared the oscillator is not running.
- If VCC did not start from 0 V, registers may hold random values: send the software reset (`rtc.reset()`).
- Without a coin cell the time is lost (OS set) whenever VCC is removed.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/PCF85063A.pdf
