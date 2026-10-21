---
name: part-max31820
description: Pinout, electrical limits, wiring and MicroPython code for the MAX31820 1-Wire ambient temperature sensor (Maxim/Analog Devices MAX31820MCR+, TO-92). Use when designing, wiring, simulating or writing code for a MAX31820 in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX31820 1-Wire ambient temperature sensor (MAX31820MCR+)

## Overview
The **MAX31820** (Maxim / Analog Devices) is a 3.3 V DS18B20-compatible digital thermometer in a TO-92 package, made for measuring **air temperature**. It measures −55 to +125 °C with **±0.5 °C** accuracy from +10 to +45 °C (±2 °C over the full range) and 9- to 12-bit resolution (12-bit, 0.0625 °C, at power-up). It talks **1-Wire** on a single data line (DQ), has a unique 64-bit ROM code (family code **28h**, the same as the DS18B20) and is software compatible with the DS18B20 and DS1822. Hobbyists buy the bare **MAX31820MCR+ in a 3-pin TO-92**; it needs one external 4.7 kΩ pull-up resistor.

## Pinout (TO-92, flat face towards you, legs down)
| Pin | Name | Function |
|---|---|---|
| 1 (left) | GND | Ground |
| 2 (middle) | DQ | 1-Wire data in/out, open-drain; 4.7 kΩ pull-up to VDD |
| 3 (right) | VDD | Supply, 3.0–3.7 V ("optional": grounded in parasite-power mode) |

## Electrical limits
- Supply (VDD): **3.0–3.7 V** (abs. max 6.0 V on any pin). Unlike the DS18B20 it is **not** a 5 V part: use 3.3 V.
- Pull-up voltage: 3.0 V to VDD (local power).
- Current: 1 mA typ, 1.5 mA max while converting; 750 nA typ idle.
- Conversion time: 750 ms max at 12-bit (375 / 187.5 / 93.75 ms at 11 / 10 / 9 bit).
- DQ sinks at least 4 mA at 0.4 V; VIL ≤ 0.8 V, VIH ≥ 2.2 V (local power).

## Interface details
- 1-Wire: reset/presence, then a ROM command (Search ROM F0h, Read ROM 33h, Match ROM 55h, Skip ROM CCh, Alarm Search ECh), then a function command.
- **Convert T [44h]**, wait ≥ 750 ms (12-bit; or poll read slots: 0 while converting, 1 when done), then **Read Scratchpad [BEh]**: 9 bytes, temperature LSB first, TH, TL, config, 3 reserved, byte 8 a Maxim CRC-8 (x⁸ + x⁵ + x⁴ + 1).
- Temperature register: 16-bit sign-extended two's complement, **1 LSB = 0.0625 °C** at 12-bit (07D0h = +125 °C, 0191h = +25.0625 °C, FF5Eh = −10.125 °C, FC90h = −55 °C).
- Power-on value of the temperature register is +85 °C (0550h).
- Write Scratchpad [4Eh] (TH, TL, config), Copy Scratchpad [48h] to EEPROM (10 ms), Recall E² [B8h], Read Power Supply [B4h].
- MicroPython's built-in `onewire` and `ds18x20` modules handle family 0x28 and do the commands and CRC check, so no extra driver file is needed.

## Wiring
- ESP32: VDD → 3V3, GND → GND, DQ → any GPIO (e.g. D4), 4.7 kΩ from DQ to 3V3.
- Pico: VDD → 3V3(OUT), GND → GND, DQ → e.g. GP22, 4.7 kΩ from DQ to 3V3.
- Raspberry Pi 4: VDD → pin 1 (3.3 V), GND → pin 6, DQ → pin 7 (GPIO4) with 4.7 kΩ to 3.3 V; enable `dtoverlay=w1-gpio` and read `/sys/bus/w1/devices/28-*/w1_slave`.
- Several sensors can share one DQ line with a single pull-up.

## Using it
```python
import machine, onewire, ds18x20, time
ds = ds18x20.DS18X20(onewire.OneWire(machine.Pin(4)))
roms = ds.scan()           # MAX31820 ROMs start with 0x28
ds.convert_temp()
time.sleep_ms(750)         # 12-bit conversion takes up to 750 ms
print('T=%.2fC' % ds.read_temp(roms[0]))
```

## Gotchas
- No pull-up → `scan()` finds nothing. The bare chip has no resistor; fit 4.7 kΩ DQ → VDD.
- Do not power it from 5 V: its supply range ends at 3.7 V.
- Swapping GND and VDD makes the TO-92 hot within seconds; unplug at once.
- Reading exactly 85 °C means you read before the conversion finished, or the chip reset.
- It shares family code 28h with the DS18B20, so code and Linux drivers treat it as one; you can't tell them apart by ROM.
- For air temperature, stand it clear of warm components and copper pours; the legs conduct board heat.
- Parasite power (VDD grounded) needs a strong pull-up switched on within 10 µs of Convert T and is not recommended above +100 °C; just use VDD.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX31820.pdf
