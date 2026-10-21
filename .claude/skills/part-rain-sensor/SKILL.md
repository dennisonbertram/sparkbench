---
name: part-rain-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the FC-37 / YL-83 rain sensor module (rain pad + LM393 comparator board, AO + DO). Use when designing, wiring, simulating or writing code for a rain sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Rain sensor module (FC-37 / YL-83)

## Overview
The **FC-37 / YL-83 rain sensor** is two boards joined by a 2-wire cable:
- a **sensing pad** with interleaved bare copper traces. Water bridges the traces and **lowers their resistance**
- a small **comparator board** with an **LM393** comparator, a pull-up resistor for the pad, a sensitivity trimmer, a power LED and a DO LED

The comparator board gives two outputs:
- **AO** (analog): near VCC when the pad is dry, and it **falls as the pad gets wetter**
- **DO** (digital): **HIGH when dry, LOW when wet**, i.e. when AO drops below the trimmer threshold. The DO LED lights when DO is LOW

It tells you "dry / a few drops / soaked". It does **not** measure rainfall in mm.

## Pinout (comparator board header, as printed: left to right)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog output, 0 V to VCC: lower = wetter |
| 2 | DO | Digital output (LM393 open collector, pulled up to VCC): LOW = wet |
| 3 | GND | Ground |
| 4 | VCC | Supply, 3.3–5 V |

The two pins on the other end of the board go to the pad (either way round).

## Electrical limits
- VCC: **3.3–5 V** (module rating; the LM393 itself runs on 2–36 V). About 8 mA with both LEDs on.
- AO and DO swing up to VCC. **On an ESP32 or Pico, power the module from 3.3 V** so both outputs stay within 3.3 V. If you power it from 5 V, put a divider on AO and DO (e.g. 10 kΩ in series, 20 kΩ to GND) and pass `divider=1.5`.

## Interface details
- The pad and the board's pull-up form a voltage divider: AO = VCC × R_pad / (R_pad + R_pullup). Dry pad = very high resistance, so AO ≈ VCC.
- The LM393 compares AO with the trimmer voltage. Its open-collector output pulls DO LOW when AO is below the threshold (TI LM393 datasheet: open-collector output, 2–36 V supply).
- No calibration: AO depends on VCC, how clean the water is and how corroded the pad is. Record your own dry and wet readings.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 (or a GPIO, see below) | 3V3(OUT) | 3.3 V (pin 1) |
| GND | GND | GND | GND |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP2 | any GPIO, e.g. GPIO17 |
| AO | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (MCP3008 / ADS1115) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi 4 has no ADC: use DO alone, or add an ADC.

## Using the driver
```python
from rain_sensor import RainSensor
import time
rain = RainSensor(34, 25)            # AO GPIO, DO GPIO; power=<GPIO> to switch VCC from a pin
while True:
    print('AO=%.2fV wet=%d%% raining=%s' % (rain.voltage(), rain.wetness(), rain.raining()))
    time.sleep(1)
```
`voltage()` averages 16 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `raining()` is True when DO is LOW. `wetness()` is a rough 0–100 % from AO (0 % = AO at VCC).

## Gotchas
- **Backwards from what you expect**: AO goes **down** with water and DO is **active LOW** ("rain" = 0).
- **The pad corrodes** when it is powered all the time (electrolysis). Feed VCC from a GPIO (about 8 mA, fine for one pin) and pass `power=` to the driver so it is only on while reading.
- **Only the pad goes outside**: the comparator board is not waterproof. Tilt the pad about 20° so water drains off.
- **Set the threshold**: sprinkle water on the pad, turn the trimmer until the DO LED just lights, then back it off slightly.
- **5 V power on a 3.3 V board**: DO's pull-up and AO both reach 5 V. Use 3.3 V or a divider.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator on the board). Module pinout: https://lastminuteengineers.com/rain-sensor-arduino-tutorial/
