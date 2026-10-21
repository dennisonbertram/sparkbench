---
name: part-l76k
description: Pinout, electrical limits, wiring and MicroPython driver for the Quectel L76K GNSS module (Waveshare L76K GPS Module, GPS/BeiDou/GLONASS, UART NMEA). Use when designing, wiring, simulating or writing code for an L76K in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Quectel L76K GNSS module (Waveshare L76K GPS Module)

## Overview
The **Quectel L76K** is a small multi-GNSS receiver (GPS, BeiDou, GLONASS and QZSS, with a built-in LNA and SAW filter). It sends **NMEA 0183** sentences (position, altitude, speed, UTC time) over a UART at **9600 baud 8N1, once per second** (up to 5 Hz), and takes settings as CASIC **$PCAS** sentences. Hobbyists buy it as the **Waveshare L76K GPS Module (SKU 23721)**: a small board with an RT9193 3.3 V regulator, MS621FE rechargeable backup battery, PPS LED, an IPEX socket for the included active antenna, and a 5-pin header.

## Pinout (Waveshare L76K GPS Module, header order)
| Pin | Function |
|---|---|
| VCC | Supply, 3.3–5 V (on-board 3.3 V regulator) |
| GND | Ground |
| TX | Module serial output (NMEA, 9600 baud, 3.3 V logic) → board's UART RX |
| RX | Module serial input (3.3 V logic) ← board's UART TX; only for settings (optional) |
| PPS | 1PPS time pulse aligned to UTC once there is a fix; drives the PPS LED (optional) |

## Electrical limits
- L76K supply 2.7–3.4 V (absolute max 3.6 V); the board's regulator takes 3.3–5 V on VCC.
- Current: about 29 mA acquiring/tracking for the module alone, about 41 mA with an active antenna; budget 100 mA.
- Digital I/O: VIH 0.8 × VCC, max VCC + 0.3 V, so RX is **not 5 V tolerant**. VOH ≥ VCC − 0.4 V.
- Backup battery on V_BCKP keeps the RTC and ephemeris for a fast hot start.

## Interface details
- UART 9600 baud 8N1 by default (9600–115200 supported via `$PCAS01`), no hardware flow control.
- Talker ID: **GN** for a multi-system fix, **GP** GPS, **BD** BeiDou, **GL** GLONASS. Expect `$GNGGA` / `$GNRMC` on a real module, and match on the sentence type after the first two letters.
- GGA: `$--GGA,hhmmss.sss,ddmm.mmmmm,N/S,dddmm.mmmmm,E/W,quality,numSv,HDOP,alt,M,...`. Quality 0 = no fix.
- RMC: `$--RMC,time,A/V,lat,N/S,lon,E/W,speed_knots,course,ddmmyy,...`. A = valid.
- Degrees = first 2 (latitude) or 3 (longitude) digits + remaining minutes / 60; negative for S and W.
- Checksum: XOR of every character between `$` and `*`, as two hex digits.
- Settings: `$PCAS01,n` baud (0 4800 … 5 115200), `$PCAS02,1000|500|200` fix interval, `$PCAS04,1..7` constellations (bit 0 GPS, bit 1 BDS, bit 2 GLONASS), `$PCAS10,n` restart (0 hot, 1 warm, 2 cold, 3 factory). The L76K does **not** accept `$PMTK` commands.
- Antenna status arrives as `$GPTXT,01,01,01,ANTENNA OK|OPEN|SHORT`.

## Wiring
- ESP32: VCC → 3V3, GND → GND, TX → GPIO16 (UART2 RX), RX → GPIO17 (UART2 TX).
- Pico: VCC → 3V3(OUT), GND → GND, TX → GP1 (UART0 RX), RX → GP0 (UART0 TX).
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, TX → pin 10 (GPIO15 RXD), RX → pin 8 (GPIO14 TXD); turn off the serial console.

## Using the driver
```python
from machine import UART, Pin
from l76k import L76K
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
gps = L76K(uart)
while True:
    if gps.update() and gps.fix:
        print('LAT=%.4f LON=%.4f ALT=%.1fm' % (gps.latitude, gps.longitude, gps.altitude or 0))
```
Call `update()` often (every 200 ms or so) so the UART buffer doesn't overflow. With RX wired, `gps.set_update_ms(200)`, `gps.set_mode(L76K.ALL)`, `gps.set_baud(115200)` and `gps.restart(2)` send the `$PCAS` sentences.

## Gotchas
- Cross TX and RX: module TX goes to the board's RX.
- Parsers that look only for `$GPGGA` never see a position, because a multi-system fix is sent as `$GNGGA`.
- No fix indoors. The first fix outdoors takes about 30 s (cold start); the PPS LED blinks once there is a fix.
- Don't drive RX from a 5 V Arduino without a level shifter, even when VCC is 5 V.
- On ESP32, avoid strapping pins (GPIO 0, 2, 12, 15) for the module's TX line.

## Datasheet
https://files.waveshare.com/upload/d/db/Quectel_L76K_Hardware_Design_V1.0.pdf (Quectel L76K Hardware Design V1.0)
Board: https://www.waveshare.com/wiki/L76K_GPS_Module and schematic https://files.waveshare.com/upload/d/df/L76X_GPS_Module_SchDoc.pdf
