---
name: part-ds1822
description: Pinout, electrical limits, wiring and MicroPython code for the DS1822 econo 1-Wire digital thermometer (Maxim/Analog Devices DS1822+, TO-92). Use when designing, wiring, simulating or writing code for a DS1822 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS1822 1-Wire econo digital thermometer (DS1822+)

## Overview
The **DS1822** (Maxim / Analog Devices) is the low-cost sibling of the DS18B20: a digital thermometer measuring −55 to +125 °C with **±2 °C** accuracy from −10 to +85 °C (±3 °C over the full range) and 9- to 12-bit resolution (12-bit, 0.0625 °C, at power-up). It talks **1-Wire** on a single data line (DQ), has a unique 64-bit ROM code (family code **22h**) and is software compatible with the DS18B20. Hobbyists buy the bare **DS1822+ in a 3-pin TO-92** package; it needs one external 4.7 kΩ pull-up resistor.

## Pinout (TO-92, flat face towards you, legs down)
| Pin | Name | Function |
|---|---|---|
| 1 (left) | GND | Ground |
| 2 (middle) | DQ | 1-Wire data in/out, open-drain; 4.7 kΩ pull-up to VDD |
| 3 (right) | VDD | Supply, 3.0–5.5 V (grounded only in parasite-power mode) |

The datasheet drawing is a **bottom view**; the table above is the same order seen from the flat face.

## Electrical limits
- Supply (VDD): 3.0–5.5 V. Power it from **3.3 V** with an ESP32 / Pico so the pull-up holds DQ at 3.3 V.
- Current: 1 mA typ, 1.5 mA max while converting; about 750 nA idle.
- Conversion time: 750 ms max at 12-bit (375 / 187.5 / 93.75 ms at 11 / 10 / 9 bit).
- DQ sinks at least 4 mA at 0.4 V; VIH ≥ 2.2 V (externally powered).

## Interface details
- 1-Wire: reset/presence, then a ROM command (Search ROM F0h, Match ROM 55h, Skip ROM CCh), then a function command.
- **Convert T [44h]**, wait ≥ 750 ms (12-bit), then **Read Scratchpad [BEh]**: 9 bytes, temperature LSB first, byte 8 a Maxim CRC-8 (x⁸ + x⁵ + x⁴ + 1).
- Temperature register: 16-bit sign-extended two's complement, **1 LSB = 0.0625 °C** at 12-bit (0191h = +25.0625 °C, FF5Eh = −10.125 °C, FC90h = −55 °C).
- Power-on value of the temperature register is +85 °C (0550h).
- MicroPython's built-in `onewire` and `ds18x20` modules accept family 0x22 and do the commands and CRC check, so no extra driver file is needed.

## Wiring
- ESP32: VDD → 3V3, GND → GND, DQ → any GPIO (e.g. D4), 4.7 kΩ from DQ to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, DQ → e.g. GP22, 4.7 kΩ from DQ to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, DQ → pin 7 (GPIO4) with 4.7 kΩ to 3.3 V; enable `dtoverlay=w1-gpio` and read `/sys/bus/w1/devices/22-*/w1_slave`.

## Using it
```python
import machine, onewire, ds18x20, time
ds = ds18x20.DS18X20(onewire.OneWire(machine.Pin(4)))
roms = ds.scan()           # DS1822 ROMs start with 0x22
ds.convert_temp()
time.sleep_ms(750)         # 12-bit conversion takes up to 750 ms
print('T=%.2fC' % ds.read_temp(roms[0]))
```

## Gotchas
- No pull-up → `scan()` finds nothing. The bare chip has no resistor; fit 4.7 kΩ DQ → VDD.
- Swapping GND and VDD makes the TO-92 hot within seconds; unplug at once.
- Reading exactly 85 °C means you read before the conversion finished, or the chip reset.
- It is only ±2 °C accurate: fine for rooms and fridges, not for precise lab work (use a DS18B20).
- Parasite power (VDD grounded) needs a strong pull-up switched on within 10 µs of Convert T; just use VDD.
- Long cables may need a stronger pull-up (e.g. 2.2 kΩ) and twisted-pair wire.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/DS1822.pdf
