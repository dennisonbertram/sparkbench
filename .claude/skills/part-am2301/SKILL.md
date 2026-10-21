---
name: part-am2301
description: Pinout, electrical limits, wiring and MicroPython usage for the AM2301 (DHT21) wired temperature & humidity sensor (Aosong/ASAIR AM2301, red/yellow/black lead). Use when designing, wiring, simulating or writing code for an AM2301 / DHT21 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# AM2301 (DHT21) wired temperature & humidity sensor (Aosong AM2301)

## Overview
The **Aosong/ASAIR AM2301** (also sold as **DHT21**) is a calibrated temperature (-40 to 80 °C, ±0.5 °C) and relative humidity (0–99.9 %RH, ±3 %RH) sensor with 0.1 °C / 0.1 %RH resolution. It comes in a black housing on a short 3-wire lead and uses the Aosong single-wire protocol (not I2C, not Dallas 1-Wire), with the same 40-bit data format as the DHT22/AM2302.

## Pinout (wire colours, datasheet table 4)
| Pin | Wire | Name | Function |
|---|---|---|---|
| 1 | Red | VDD | Supply, 3.3–5.5 V (5 V recommended) |
| 2 | Yellow | SDA | Single-wire bidirectional data (not I2C); needs a 5.1 kΩ pull-up |
| 3 | Black | GND | Ground |

## Electrical limits
- Supply: 3.3–5.5 V DC (absolute max 5.5 V); data pin -0.3 V to VDD + 0.3 V.
- Current: about 1.2 mA while measuring, 15 µA asleep, 600 µA average at one read every 2 s.
- Pull-up on the data wire: 5.1 kΩ typical (1–100 kΩ); lower it only for leads over 30 m.
- On 3.3 V keep the lead under 1 m.

## Interface details
- Host pulls the data line low for 0.8–20 ms (typ. 1 ms) and releases it; the sensor answers 80 µs low + 80 µs high, then sends 40 bits MSB first (50 µs low, then 26 µs high = 0 or 70 µs high = 1).
- Data: humidity (16 bit, value x10), temperature (16 bit, value x10, bit 15 = minus sign), checksum = low 8 bits of the sum of the first four bytes.
  Example from the datasheet: 0x0292 = 658 → 65.8 %RH; 0x010D = 269 → 26.9 °C; 0x8065 → -10.1 °C.
- Wait 2 s after power-up; read no faster than every 2 s. Each read returns the previous measurement.
- MicroPython's built-in `dht.DHT22` class implements exactly this format (including the sign bit and checksum), so no extra driver file is needed.

## Wiring
- ESP32: red → 3V3 (or 5V), black → GND, yellow → GPIO25, plus 5.1 kΩ from yellow to the supply. Not GPIO 34–39.
- Pico: red → 3V3(OUT), black → GND, yellow → GP2, plus 5.1 kΩ from yellow to 3V3.
- Raspberry Pi 4: red → pin 1 (3.3 V), black → pin 6, yellow → GPIO4 (pin 7) with a 5.1 kΩ pull-up; read with adafruit_dht.DHT22.

## Using it
```python
from machine import Pin
import dht, time
sensor = dht.DHT22(Pin(25))   # AM2301 uses the DHT22 data format
time.sleep(2)
while True:
    sensor.measure()
    print('T=%.1fC H=%.1f%%' % (sensor.temperature(), sensor.humidity()))
    time.sleep(2)
```

## Gotchas
- The yellow wire is called SDA in the datasheet but it is NOT I2C: any bidirectional GPIO works.
- `OSError` from `measure()` means no answer or a bad checksum: check the pull-up, the wiring and the 2 s read interval; catch it and retry.
- Use the DHT22 class, not DHT11: DHT11 decoding would drop the decimals and the minus sign.
- After a long pause the first value is stale; read twice and keep the second.
- Long exposure above 80 %RH causes temporary drift (recovers in normal air).

## Datasheet
https://www.lcsc.com/datasheet/C83990.pdf
