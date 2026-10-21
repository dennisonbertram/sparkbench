---
name: part-mb1010
description: Pinout, electrical limits, wiring and MicroPython driver for the MaxBotix LV-MaxSonar-EZ1 MB1010 ultrasonic rangefinder (analog output, 6-254 in). Use when designing, wiring, simulating or writing code for an MB1010 / LV-MaxSonar-EZ in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MaxBotix LV-MaxSonar-EZ1 ultrasonic rangefinder (MB1010)

## Overview
The **MB1010 LV-MaxSonar-EZ1** (MaxBotix, also sold as SparkFun SEN-08502) is a small green board with a 42 kHz ultrasonic transducer. It times the echo of a sound burst and reports the distance to the nearest object.
- Range: reports **6 to 254 inches** (15 cm to 6.45 m) with **1-inch resolution**. Objects closer than 6 in read as 6 in.
- Three outputs work at the same time: **analog AN = (Vcc/512) V per inch**, **pulse width PW = 147 µs per inch**, and **serial on TX** (9600 baud, "R" + 3 digits + CR).
- A new reading every **49 ms** (about 20 Hz) in free-run mode.
- EZ1 is the medium-width beam of the series (MB1000 EZ0 widest … MB1040 EZ4 narrowest); a brown paint dot marks the MB1010.

## Pinout (7-hole row, as printed on the board)
| Board label | Datasheet pin | Function |
|---|---|---|
| GND | 7 | Ground |
| +5 | 6 | Supply Vcc, 2.5–5.5 V |
| TX | 5 | Serial out, 9600 8N1, 0–Vcc, RS232 polarity (inverted) |
| RX | 4 | Ranging control, internal pull-up (open = free-run) |
| AN | 3 | Analog out, Vcc/512 V per inch |
| PW | 2 | Pulse width out, 147 µs per inch |
| BW | 1 | Open/low = serial on TX; high = chaining pulse on TX |

The board has plain holes: solder on a 7-pin 0.1" header (or wires).

## Electrical limits
- Supply: **2.5–5.5 V**, 2 mA typical (recommend 2 mA capability at 3 V, 3 mA at 5 V). The minimum voltage rises at low temperature (datasheet page 4).
- AN scale follows the supply: **6.4 mV/in at 3.3 V**, 9.8 mV/in at 5 V. At 3.3 V the full 254 in is 1.64 V; at 5 V it is 2.48 V. Either is safe for a 3.3 V ADC.
- TX and PW swing 0–Vcc: powered from 5 V they are 5 V signals and need a divider before a 3.3 V GPIO. Powering the sensor from 3V3 avoids that.
- The supply must be ripple- and noise-free; noise on Vcc shows up as false readings.

## Interface details
Analog (datasheet pin 3 description):
```
range (in) = V_AN / (Vcc / 512) = V_AN × 512 / Vcc
range (cm) = range (in) × 2.54
```
Examples at Vcc = 3.3 V: 0.645 V = 100 in, 1.031 V = 160 in.
The AN output is buffered and holds the latest range. After a long jump in distance it may need more than one 49 ms cycle to settle.
Timing: 250 ms after power-up the sensor is ready; it then runs a 49 ms calibration cycle and a 49 ms range cycle, so the first reading takes about 100 ms more. With RX held low it stops ranging; pulse RX high ≥ 20 µs to trigger one reading.
Accuracy: timing is calibrated to 1 % at 5 V; at 3.3 V readings are typically 1–2 % further than actual. Targets 6–20 in away can be off by up to 2 in (near-field phase effects).

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| +5 | 3V3 | 3V3(OUT) (pin 36) | 3V3 (pin 1) |
| GND | GND | GND | GND |
| AN | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (MCP3008 / ADS1115), or use TX with an inverted UART |
| RX, TX, PW, BW | leave open | leave open | leave open |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from mb1010 import MB1010
import time
sensor = MB1010(26, vcc=3.3)   # GPIO wired to AN; vcc = voltage on the +5 pin
while True:
    print('D=%.0fin (%.0f cm)' % (sensor.inches(), sensor.cm()))
    time.sleep_ms(100)
```
`voltage()` averages 8 ADC samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535). `inches()` applies the datasheet scale and clamps to 6–254 in; `cm()` converts to centimetres.

## Gotchas
- **Wrong vcc** in the driver scales every reading: powered from 5 V, pass `vcc=5.0`.
- **Power-up calibration**: keep at least 7 in (ideally 14 in) in front of the sensor clear when it powers up, or it may ignore objects at that distance. Recalibrate by cycling power.
- **Close range**: anything under 6 in reads as 6 in.
- **Noisy supply** (motors, servos on the same rail) causes jumpy readings; decouple +5 to GND near the sensor.
- **TX is inverted RS232 polarity**, not a normal TTL UART; use `invert=UART.INV_RX` on the board's UART if you read it.
- Soft, angled or small targets may not echo back; the sensor is for protected indoor use.

## Datasheet
https://maxbotix.com/cdn/shop/files/LV-MaxSonar-EZ_Datasheet.pdf
