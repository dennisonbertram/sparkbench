---
name: part-ds18b20
description: Pinout, electrical limits, wiring and MicroPython code for the DS18B20 1-Wire digital thermometer on a KY-001 module (DS18B20). Use when designing, wiring, simulating or writing code for a DS18B20 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS18B20 1-Wire temperature sensor (DS18B20)

## Overview
The **DS18B20** (Maxim / Analog Devices) is a digital thermometer measuring −55 to +125 °C (±0.5 °C from −10 to +85 °C) with 9- to 12-bit resolution (12-bit, 0.0625 °C, at power-up). It talks the **1-Wire** protocol on a single data line (DQ), and each chip has a unique 64-bit ROM code, so many sensors can share one GPIO. Hobbyists buy it on the **KY-001 temperature sensor module**: a TO-92 DS18B20, a 4.7 kΩ pull-up from DQ to + and a 3-pin header.

## Pinout (KY-001 module, header order)
| Pin | Function |
|---|---|
| S | 1-Wire data (DQ), 4.7 kΩ pull-up to + on the module |
| + | Supply, 3.0–5.5 V (use 3.3 V with an ESP32 / Pico) |
| - | Ground |

## Electrical limits
- Supply (VDD): 3.0–5.5 V. The pull-up goes to the module's +, so power it from **3.3 V** when the data pin goes to a 3.3 V microcontroller.
- Current: about 1 mA (1.5 mA max) while converting, under 1 µA idle.
- Conversion time: 750 ms max at 12-bit (375 / 187.5 / 93.75 ms at 11 / 10 / 9 bit).

## Interface details
- 1-Wire: reset/presence, then a ROM command (Search ROM F0h, Match ROM 55h, Skip ROM CCh), then a function command.
- **Convert T [44h]**, wait ≥ 750 ms (12-bit), then **Read Scratchpad [BEh]**: 9 bytes, temperature LSB first, last byte a Maxim CRC-8 (x⁸ + x⁵ + x⁴ + 1).
- Temperature register: 16-bit two's complement, **1 LSB = 0.0625 °C** at 12-bit (e.g. 0191h = +25.0625 °C, FF5Eh = −10.125 °C).
- Family code 0x28. The power-on value of the register is +85 °C (0550h): reading exactly 85 usually means you read before a conversion finished, or the sensor reset (power dropout).
- MicroPython's built-in `onewire` and `ds18x20` modules (on ESP32 and Pico firmware) implement all of this, including the CRC check, so no extra driver file is needed.

## Wiring
- ESP32: + → 3V3, - → GND, S → any GPIO, e.g. D4.
- Pico: + → 3V3(OUT), - → GND, S → e.g. GP22.
- Raspberry Pi 4: + → pin 1 (3.3 V), - → pin 6, S → pin 7 (GPIO4, enable `dtoverlay=w1-gpio` and read `/sys/bus/w1/devices/28-*/w1_slave`).

## Using it
```python
import machine, onewire, ds18x20, time
ds = ds18x20.DS18X20(onewire.OneWire(machine.Pin(4)))
roms = ds.scan()
ds.convert_temp()
time.sleep_ms(750)  # 12-bit conversion takes up to 750 ms
print('T=%.2fC' % ds.read_temp(roms[0]))
```

## Gotchas
- Always wait 750 ms after `convert_temp()` before `read_temp()`; otherwise you get the old value (or 85 °C after power-up).
- `scan()` returns an empty list: wrong GPIO, or + / - swapped. Swapping + and - makes the TO-92 hot quickly — unplug at once.
- Several KY-001 modules on one wire put their 4.7 kΩ pull-ups in parallel; with more than 2–3, remove extra resistors.
- Long cables (several metres) may need a stronger pull-up (e.g. 2.2 kΩ) and twisted-pair wiring.
- Don't use parasite power with these modules: the + pin must be connected.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf
