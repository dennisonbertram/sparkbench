---
name: part-ina3221
description: Pinout, electrical limits, wiring and MicroPython driver for the INA3221 3-channel current & voltage monitor (TI INA3221). Use when designing, wiring, simulating or writing code for an INA3221 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# INA3221 3-channel current & voltage monitor (INA3221)

## Overview
The **INA3221** from Texas Instruments monitors three supplies at once. For each channel it measures the voltage across a shunt resistor (±163.8 mV, 40 µV per count) and the bus voltage at the load side of the shunt (0–26 V, 8 mV per count). It talks I2C. Hobbyists buy it on the **Adafruit INA3221 breakout (#6062)**, which has three 0.05 Ω shunts (about ±3.2 A per channel), screw terminals, STEMMA QT connectors and 10 kΩ pull-ups on SDA/SCL.

## Pinout (Adafruit #6062, 15-pin header order)
| Pin | Function |
|---|---|
| VCC | Chip supply, 2.7–5.5 V; sets the I2C logic level |
| GND | Ground (shared with the microcontroller and the measured supplies) |
| SCL | I2C clock |
| SDA | I2C data |
| VIN3+ / VIN3- | Channel 3 shunt: supply side / load side |
| VIN2+ / VIN2- | Channel 2 shunt: supply side / load side |
| VIN1+ / VIN1- | Channel 1 shunt: supply side / load side |
| WRN | Warning alert, open-drain, active low (optional) |
| CRI | Critical alert, open-drain, active low (optional) |
| TC | Timing-control alert, open-drain, active low (optional) |
| VALID | Power-valid output, pulled up to VPU (optional) |
| VPU | Pull-up supply for VALID: link to VCC only if you use VALID |

## Electrical limits
- Supply (VCC): 2.7–5.5 V; 350 µA typical, 450 µA max.
- VIN± pins: 0–26 V (absolute range −0.3 to 26 V). Never connect them to a GPIO.
- Shunt full scale ±163.8 mV → about ±3.2 A with the 0.05 Ω shunts.
- I2C up to 2.44 MHz (400 kHz is plenty).

## Interface details
- **I2C address 0x40** (A0 pulled to GND on the board); close the Addr jumper for 0x41. The chip also supports 0x42 (A0 to SDA) and 0x43 (A0 to SCL).
- 16-bit registers, MSB first: 00h config (POR 7127h), 01h/03h/05h shunt voltage ch1–3, 02h/04h/06h bus voltage ch1–3, FEh manufacturer ID (5449h), FFh die ID (3220h).
- Shunt and bus registers are signed two's complement in bits 15..3 (bits 2..0 read 0): value = (signed word >> 3) × 40 µV (shunt) or × 8 mV (bus).
- Current = shunt voltage / R_shunt (0.05 Ω).
- The driver writes config 7527h: all three channels, 16 averages, 1.1 ms shunt and bus conversion, continuous mode (about 106 ms per full cycle).

## Wiring
- ESP32: VCC → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: VCC → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: VCC → pin 1 (3.3 V), GND → pin 6, SDA → pin 3, SCL → pin 5.
- Each measured circuit: supply + → VINn+, VINn- → load +, supply − → GND.

## Using the driver
```python
from machine import I2C, Pin
from ina3221 import INA3221
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
sensor = INA3221(i2c)            # 0x40, 0.05 ohm shunts
for ch in (1, 2, 3):
    v, i = sensor.read(ch)       # volts, milliamps
    print('CH%d V=%.3fV I=%.1fmA' % (ch, v, i))
```

## Gotchas
- `INA3221 not found`: the ID registers did not read 5449h/3220h; check SDA/SCL and power.
- Forgetting the `>> 3`: the low three bits are unused, so raw words read 8× too large.
- Bus voltage is measured at VINn-, the load side of the shunt.
- Carry load current through the screw terminals, not thin header pins or breadboard jumpers.
- The measured supplies must share GND with the board, or the bus readings are meaningless.

## Datasheet
https://www.ti.com/lit/ds/symlink/ina3221.pdf
