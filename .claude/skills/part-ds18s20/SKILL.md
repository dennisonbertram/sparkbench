---
name: part-ds18s20
description: Pinout, electrical limits, wiring and MicroPython code for the DS18S20 1-Wire digital thermometer (DS18S20+, TO-92). Use when designing, wiring, simulating or writing code for a DS18S20 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DS18S20 1-Wire digital thermometer (DS18S20+)

## Overview
The **DS18S20** (Maxim / Analog Devices) measures −55 to +125 °C (±0.5 °C from −10 to +85 °C, ±2 °C over the full range). It has a fixed 9-bit temperature register (0.5 °C per LSB) plus COUNT_REMAIN and COUNT_PER_C bytes that give 1/16 °C steps with the datasheet's extended-resolution formula. It talks **1-Wire** on one data line (DQ), family code **10h**, and each chip has a unique 64-bit ROM code. Hobbyists buy the bare **DS18S20+ in a 3-pin TO-92** package and add a 4.7 kΩ pull-up.

## Pinout (TO-92, flat face towards you, legs down)
| Pin | Name | Function |
|---|---|---|
| 1 (left) | GND | Ground |
| 2 (middle) | DQ | 1-Wire data, open-drain; 4.7 kΩ pull-up to VDD |
| 3 (right) | VDD | Supply 3.0–5.5 V (grounded only in parasite-power mode) |

The datasheet drawing is a **bottom view**; the order above is as seen from the flat face.

## Electrical limits
- Supply (VDD): 3.0–5.5 V. Power it from **3.3 V** with an ESP32 / Pico so the pull-up keeps DQ at 3.3 V.
- Current: 1 mA typ, 1.5 mA max while converting; 750 nA standby.
- Conversion time: 750 ms max (no resolution setting).

## Interface details
- 1-Wire: reset/presence, ROM command (Search F0h, Match 55h, Skip CCh), then **Convert T [44h]**, wait ≥ 750 ms, **Read Scratchpad [BEh]**: 9 bytes, last one a Maxim CRC-8 (x⁸ + x⁵ + x⁴ + 1).
- Temperature register: 16-bit sign-extended two's complement, **0.5 °C per LSB** (0032h = +25.0 °C, FFFFh = −0.5 °C, FFCEh = −25.0 °C).
- Extended resolution: TEMP_READ = register with bit 0 truncated; **T = TEMP_READ − 0.25 + (COUNT_PER_C − COUNT_REMAIN) / COUNT_PER_C**, COUNT_PER_C hard-wired to 16 (byte 7), COUNT_REMAIN is byte 6.
- Power-on value is +85 °C (00AAh).
- MicroPython's built-in `onewire` and `ds18x20` modules handle family 10h, including the extended-resolution formula and the CRC check, so no extra driver file is needed.

## Wiring
- ESP32: VDD → 3V3, GND → GND, DQ → any GPIO (e.g. D4), 4.7 kΩ from DQ to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, DQ → e.g. GP22, 4.7 kΩ from DQ to 3V3.
- Raspberry Pi: VDD → pin 1, GND → pin 6, DQ → pin 7 (GPIO4) with 4.7 kΩ to 3.3 V; `dtoverlay=w1-gpio`, read `/sys/bus/w1/devices/10-*/w1_slave`.

## Using it
```python
import machine, onewire, ds18x20, time
ds = ds18x20.DS18X20(onewire.OneWire(machine.Pin(4)))
roms = ds.scan()
ds.convert_temp()
time.sleep_ms(750)  # conversion takes up to 750 ms
print('T=%.2fC' % ds.read_temp(roms[0]))
```

## Gotchas
- Not a DS18B20: hand-written decoders that multiply the register by 0.0625 read the DS18S20 eight times too low. Check the family code (10h).
- Reading exactly 85 °C means the conversion had not finished or the sensor reset.
- Reversing GND and VDD makes the TO-92 hot quickly; unplug at once.
- `scan()` empty: missing pull-up, wrong GPIO, or swapped pins.
- Long cables may need a stronger pull-up (e.g. 2.2 kΩ). Avoid parasite power for beginner builds.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/DS18S20.pdf
