---
name: part-mcp7940n
description: Pinout, electrical limits, wiring and MicroPython driver for the MCP7940N battery-backed real-time clock (Microchip MCP7940N, M12 Labs breakout). Use when designing, wiring, simulating or writing code for an MCP7940N RTC in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MCP7940N real-time clock module (MCP7940N)

## Overview
The **MCP7940N** from Microchip is a low-power real-time clock/calendar: seconds, minutes, hours (12 or 24 h), weekday, date, month and year in BCD, with leap years handled up to 2399. It has two alarms, a multifunction output pin (MFP) that can be an alarm interrupt, a square wave or a GPIO, digital trimming, power-fail/power-up time stamps and **64 bytes of battery-backed SRAM**. It talks I2C at up to 400 kHz. The modelled board is the **M12 Labs MCP7940N Real-Time Clock (RTC) Breakout Board** (Tindie), with a 32.768 kHz crystal, coin-cell holder, **10 kOhm I2C pull-ups on board**, a 2x5 header J1 and two Qwiic/STEMMA QT sockets.

## Pinout (M12 Labs board, header J1 labelled row)
| Pin | Function |
|---|---|
| VCC | Supply, 1.8-5.5 V (use 3.3 V with ESP32/Pico) |
| MFP | Multifunction output, open-drain (alarm / square wave / GPIO); optional, needs a 10 kOhm pull-up if used |
| SCL | I2C clock (10 kOhm pull-up to VCC on board) |
| SDA | I2C data (10 kOhm pull-up to VCC on board) |
| GND | Ground |

J2 and J3 are JST-SH Qwiic/STEMMA QT sockets carrying GND, VCC, SDA, SCL.

## Electrical limits
- VCC 1.8-5.5 V; I2C up to 400 kHz at 2.5-5.5 V, 100 kHz below 2.5 V. Absolute max 6.5 V.
- Backup cell (VBAT) 1.3-5.5 V; switchover at about 1.5 V; ~0.9 uA from a 3 V cell.
- Current: about 1.2 uA timekeeping at 3.3 V, up to 400 uA while the I2C bus is busy.
- VIH = 0.7 x VCC. The on-board pull-ups go to VCC, so at VCC = 5 V the bus would sit at 5 V: power the board from 3.3 V on 3.3 V microcontrollers.

## Interface details
- **I2C address 0x6F** (control byte 1101111x), fixed. SRAM is at registers 20h-5Fh at the same address.
- 00h RTCSEC (**bit 7 ST: oscillator start**, 0 at power-up), 01h RTCMIN, 02h RTCHOUR (bit 6 = 12-hour mode, bit 5 AM/PM), 03h RTCWKDAY (bit 5 OSCRUN read-only, bit 4 PWRFAIL, **bit 3 VBATEN**, bits 2-0 weekday 1-7), 04h RTCDATE, 05h RTCMTH (bit 5 LPYR read-only), 06h RTCYEAR. Order is like the DS1307: weekday before date.
- 07h CONTROL (OUT, SQWEN, ALM1EN, ALM0EN, EXTOSC, CRSTRIM, SQWFS1:0; reset 0x80), 08h OSCTRIM.
- Alarms at 0Ah-0Fh and 11h-16h; ALMxWKDAY holds ALMPOL, the mask (000 sec, 001 min, 010 hour, 011 weekday, 100 date, 111 all) and the ALMxIF flag (writing the register clears it).
- Weekday is a 1-7 counter with no fixed meaning; this driver uses 1 = Monday ... 7 = Sunday.
- Read 00h-06h in one burst: the chip buffers the time against rollover during a read.
- To set the time: clear ST, wait for OSCRUN to clear, load the registers, set ST (the driver does this).

## Wiring
- ESP32: VCC -> 3V3, GND -> GND, SDA -> D21, SCL -> D22 (pull-ups already on the board).
- Pico: VCC -> 3V3(OUT), GND -> GND, SDA -> GP4, SCL -> GP5.
- Raspberry Pi 4: VCC -> pin 1 (3.3 V), GND -> pin 6, SDA -> pin 3, SCL -> pin 5.
- Optional: MFP -> any GPIO with a 10 kOhm pull-up to 3.3 V (or the GPIO's internal pull-up) for alarm interrupts.

## Using the driver
```python
from machine import I2C, Pin
from mcp7940n import MCP7940N
i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
rtc = MCP7940N(i2c)
if not rtc.is_running():
    rtc.datetime((2026, 10, 21, 12, 0, 0))  # year, month, day, hour, minute, second; starts the clock
y, mo, d, wd, h, mi, s = rtc.datetime()      # wd: 1 = Monday ... 7 = Sunday
print('%04d-%02d-%02d %02d:%02d:%02d' % (y, mo, d, h, mi, s))
rtc.sram_write(0, b'hello')                  # 64 bytes kept by the coin cell
```

## Gotchas
- A new chip does not tick: nothing counts until ST is set. If the time stays frozen, set it once with the driver.
- The coin cell does nothing until VBATEN is set; the driver sets it whenever it sets the time.
- PWRFAIL is set when main power was lost while on the cell; writing RTCWKDAY clears it (and the time stamps).
- MFP is open-drain and active LOW for alarms by default; it reads LOW without a pull-up.
- The MCP7940M is the same chip without a VBAT pin; the MCP79410/11/12 add an EEPROM at 0x57.
- Simulator note: the simulated clock ticks from the start and does not model OSCRUN, so is_running() reads False there.

## Datasheet
https://ww1.microchip.com/downloads/en/DeviceDoc/20005010H.pdf
