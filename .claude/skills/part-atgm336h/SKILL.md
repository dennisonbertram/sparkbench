---
name: part-atgm336h
description: Pinout, electrical limits, wiring and MicroPython driver for the ATGM336H GPS/BDS module (ATGM336H-5N-31). Use when designing, wiring, simulating or writing code for an ATGM336H in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ATGM336H GPS/BDS module (ATGM336H-5N-31)

## Overview
The **ATGM336H-5N** from Zhongke Microelectronics (AT6558 chip) is a small GNSS receiver; the **-31** version uses GPS and BeiDou together. It sends **NMEA 0183** sentences (position, altitude, speed, UTC time) over a UART at **9600 baud 8N1, once per second**. Hobbyists buy it as the **GOOUUU ATGM336H-5N-31 GPS+BD module**: a small black board with a regulator, backup battery, fix LED, an IPEX socket for the included ceramic patch antenna, and a 5-pin header.

## Pinout (GOOUUU ATGM336H GPS+BD module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board regulator) |
| GND | Ground |
| TX | Module serial output (NMEA, 9600 baud, 3.3 V logic) → board's UART RX |
| RX | Module serial input (3.3 V logic) ← board's UART TX; only for settings (optional) |
| PPS | One pulse per second, rising edge aligned to UTC, once there is a fix (optional) |

## Electrical limits
- Module supply 2.7–3.6 V (absolute max 3.6 V); the breakout's regulator takes 3.3–5 V on VCC.
- Current: under 25 mA tracking at 3.3 V, peaks up to 100 mA (plus the antenna).
- Digital inputs: max VCC + 0.2 V, so RX is **not 5 V tolerant**. Outputs swing 0–3.3 V.
- Backup battery on the board keeps time and satellite data for a hot start (about 1 s).

## Interface details
- UART 9600 baud 8N1 by default (4800–115200 supported via `$PCAS01`).
- Talker ID: **GN** when GPS and BDS are combined, **GP** for GPS only, **BD** for BeiDou only. So expect `$GNGGA` / `$GNRMC` on a real module, and match on the sentence type after the first two letters.
- GGA: `$--GGA,hhmmss.sss,ddmm.mmmm,N/S,dddmm.mmmm,E/W,quality,numSv,HDOP,alt,M,...`. Quality 0 = no fix.
- RMC: `$--RMC,time,A/V,lat,N/S,lon,E/W,speed_knots,course,ddmmyy,...`. A = valid.
- Degrees = first 2 (latitude) or 3 (longitude) digits + remaining minutes / 60; negative for S and W.
- Checksum: XOR of every character between `$` and `*`, as two hex digits.
- Settings (CASIC protocol): `$PCAS02,1000*2E` sets the fix rate (1000/500/250/200/100 ms), `$PCAS04,3*1A` uses GPS+BDS (1 GPS, 2 BDS), `$PCAS10,n` restarts (0 hot, 1 warm, 2 cold, 3 factory), `$PCAS00*01` saves the settings to flash.
- Antenna status arrives as `$GPTXT,01,01,01,ANTENNA OK|OPEN|SHORT`.

## Wiring
- ESP32: VCC → 3V3, GND → GND, TX → GPIO16 (UART2 RX), RX → GPIO17 (UART2 TX).
- Pico: VCC → 3V3(OUT), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (GPIO15 RXD), RX → pin 8 (GPIO14 TXD); turn off the serial console.

## Using the driver
```python
from machine import UART, Pin
from atgm336h import ATGM336H
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
gps = ATGM336H(uart)
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
```
`update()` must be called often (every 200 ms or so) so the UART buffer doesn't overflow. With RX wired, `gps.set_update_ms(200)`, `gps.set_mode(ATGM336H.GPS_BDS)`, `gps.restart(2)` and `gps.save()` send the `$PCAS` sentences.

## Gotchas
- Cross TX and RX: module TX goes to the board's RX.
- Parsers that look only for `$GPGGA` never see a position from this module, because it sends `$GNGGA`.
- No fix indoors. The first fix outdoors can take 35 s or longer; the LED blinks once there is a fix.
- Don't drive RX from a 5 V Arduino without a level shifter.
- On ESP32, avoid strapping pins (GPIO 0, 2, 12, 15) for TX: the module drives the line at boot.

## Datasheet
https://www.tinytronics.nl/product_files/002176_ATGM336H.pdf (ATGM336H-5N user manual)
Protocol: https://espruino.com/files/CASIC_en.pdf (CASIC multimode receiver protocol specification)
