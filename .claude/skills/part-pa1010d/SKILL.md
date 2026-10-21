---
name: part-pa1010d
description: Pinout, electrical limits, wiring and MicroPython driver for the PA1010D Mini GPS module (CDtop PA1010D, MediaTek MT3333, Adafruit 4415, UART NMEA). Use when designing, wiring, simulating or writing code for a PA1010D in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PA1010D Mini GPS module (CDtop PA1010D)

## Overview
The **CD-PA1010D** from CDtop (MediaTek MT3333 chip) is a 10 × 10 mm GNSS receiver with its ceramic patch antenna built in on top. It uses GPS and GLONASS together by default and sends **NMEA 0183** sentences (position, altitude, speed, UTC time) over a UART at **9600 baud 8N1, once per second** (up to 10 Hz). It also has an I2C interface (address 0x10), not used by this part. Hobbyists buy it as the **Adafruit Mini GPS PA1010D - UART and I2C - STEMMA QT (product 4415)**: a 1" square board with an AP2112K 3.3 V regulator, level shifting on RXI/SDA/SCL, two STEMMA QT sockets, power and PPS LEDs and a CR1220 holder footprint on the back.

## Pinout (Adafruit 4415, header by header as printed)
The board has two 6-pin headers on opposite edges, so it is wired with jumper leads.

| Pin | Function |
|---|---|
| VIN | Supply, 3.3–5 V (on-board AP2112K regulator) |
| 3Vo | 3.3 V regulator output (not an input) |
| GND | Ground |
| SCL | I2C clock (10 kΩ pull-up, level shifted); unused in UART mode |
| SDA | I2C data (10 kΩ pull-up, level shifted); unused in UART mode |
| Rst (RST) | Reset, active low (optional) |
| GND (GND2) | Ground, second header |
| PPS | 1 pulse per second output, 2.8 V CMOS (optional) |
| VIN (VIN2) | Same as VIN |
| RXI | Module serial input, level shifted 3–5 V ← board's UART TX (only for commands) |
| TXO | Module serial output, NMEA 9600 baud, 3.3 V logic → board's UART RX |
| WAKE | Wake from backup mode, active high (optional) |

## Electrical limits
- Module supply 3.0–4.3 V (absolute max 4.3 V), ripple under 50 mVpp; the breakout's regulator takes 3.3–5 V on VIN.
- Current: 36 mA acquiring, 28 mA tracking at 3.3 V, 1 Hz. Backup: 18 µA at 3 V.
- TXO high level is 2.4–2.8 V: fine for 3.3 V boards. RXI and SDA/SCL are level shifted on the Adafruit board, so 5 V logic is OK there.

## Interface details
- UART 9600 baud 8N1 by default, 1 Hz updates (PMTK220 sets 100–10000 ms).
- Talker ID: **GN** by default (GPS+GLONASS), **GP** after `$PMTK353,1,0,0,0,0*2A` (GPS only), **GL** for GLONASS only.
- GGA: `$GNGGA,hhmmss.sss,ddmm.mmmm,N/S,dddmm.mmmm,E/W,fix,sats,HDOP,alt,M,geoid,M,,*CS`. Fix 0 = none, 1 = GPS, 2 = DGPS.
- RMC: `$GNRMC,time,A/V,lat,N/S,lon,E/W,speed_knots,course,ddmmyy,magvar,E/W,mode*CS`. A = valid.
- Degrees = first 2 (latitude) or 3 (longitude) digits + remaining minutes / 60; negative for S and W.
- Checksum: XOR of every character between `$` and `*`, as two hex digits.
- Commands are MediaTek PMTK sentences, acknowledged with `$PMTK001,<cmd>,3` on success: `$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28` (RMC+GGA only), `$PMTK220,1000*1F` (1 Hz), `$PMTK251,115200*1F` (baud), `$PMTK101`–`104` (hot/warm/cold/full cold restart), `$PMTK161,0*28` (standby), `$PMTK225,0*2B` (full power).
- TTFF: hot 1 s, warm 33 s, cold 35 s typical (60 s max).

## Wiring
- ESP32: VIN → 3V3, GND → GND, TXO → GPIO16 (UART2 RX), RXI → GPIO17 (UART2 TX).
- Pico: VIN → 3V3(OUT), GND → GND, TXO → GP1 (UART0 RX), RXI → GP0 (UART0 TX).
- Raspberry Pi 4: VIN → pin 1 (3.3 V), GND → pin 6, TXO → pin 10 (GPIO15 RXD), RXI → pin 8 (GPIO14 TXD); turn off the serial console.

## Using the driver
```python
from machine import UART, Pin
from pa1010d import PA1010D
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
gps = PA1010D(uart)
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
```
Call `update()` every 200 ms or so so the UART buffer doesn't overflow. With RXI wired: `gps.set_output_rmc_gga()`, `gps.set_update_ms(200)`, `gps.set_baud(115200)`, `gps.restart(2)`, `gps.standby()`; `gps.last_ack` holds the last `$PMTK001` reply.

## Gotchas
- Cross TX and RX: TXO goes to the board's RX.
- Parsers that look only for `$GPGGA` never see a position, because the module sends `$GNGGA`.
- The built-in antenna is small: it needs a clear view of the sky, antenna side up. No fix indoors is normal.
- Above 1 Hz at 9600 baud, cut the sentence list (PMTK314) or raise the baud rate, or sentences get dropped.
- The STEMMA QT sockets are I2C only; for UART use the TXO/RXI header pins.
- On ESP32, avoid strapping pins (GPIO 0, 2, 12, 15) for the RX line: the module drives it at boot.

## Datasheet
https://cdn-learn.adafruit.com/assets/assets/000/084/295/original/CD_PA1010D_Datasheet_v.03.pdf (CD-PA1010D datasheet v.03)
Board: https://learn.adafruit.com/adafruit-mini-gps-pa1010d-module/pinouts, https://github.com/adafruit/Adafruit-PA1010D-Mini-GPS-PCB
