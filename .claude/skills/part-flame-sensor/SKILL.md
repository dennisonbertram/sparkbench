---
name: part-flame-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the KY-026 flame sensor module (IR phototransistor + LM393 comparator, AO + DO). Use when designing, wiring, simulating or writing code for a flame sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Flame sensor module (KY-026)

## Overview
The **KY-026 flame sensor** is a small board with:
- a **5 mm black IR phototransistor** (YG1006-type) that sees infrared in the **760–1100 nm** band, which flames give off strongly. Viewing angle about 60°, range about 60–100 cm for a lighter or candle flame
- an **LM393 comparator**, a blue **sensitivity trimmer**, a power LED (LED1) and a flame LED (LED2)

It has two outputs:
- **AO** (analog): near the supply voltage with no IR, and it **falls as the flame gets stronger or closer** (Joy-IT: "the signal is inverted")
- **DO** (digital): on the Joy-IT KY-026, **HIGH when a flame is detected** (LED2 lit), LOW otherwise. Some clones are the other way round

It reacts to infrared, not to fire as such. It does not measure temperature.

## Pinout (header as printed, AO end first)
| Pin | Name | Function |
|-----|------|----------|
| 1 | AO | Analog output, 0 V to supply: lower = more IR / flame |
| 2 | G | Ground |
| 3 | + | Supply, 3.3–5 V |
| 4 | DO | Digital output from the LM393: HIGH = flame (Joy-IT board) |

## Electrical limits
- Supply: **3.3–5 V** (module rating; the LM393 itself runs on 2–36 V). A few mA with both LEDs on.
- AO and DO swing up to the supply. **On an ESP32 or Pico, power the module from 3.3 V** so both outputs stay within 3.3 V.

## Interface details
- The phototransistor and a resistor to the supply form a divider. More IR makes the phototransistor conduct harder and pulls AO down.
- The LM393 compares that voltage with the trimmer voltage and switches DO when it crosses the threshold (TI LM393 datasheet: open-collector output, pulled up on the board).
- No calibration: AO depends on the supply, ambient light and the trimmer. Record your own no-flame and flame readings.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| + | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| G | GND | GND | GND (pin 6) |
| DO | any GPIO, e.g. GPIO25 | any GP, e.g. GP2 | any GPIO, e.g. GPIO24 (pin 18) |
| AO | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115 / KY-053) |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi 4 has no ADC: use DO alone, or add an ADC.

## Using the driver
```python
from flame_sensor import FlameSensor
import time
f = FlameSensor(34, 25)          # AO GPIO, DO GPIO; active_high=False for clones whose DO goes LOW on flame
while True:
    print('AO=%.2fV IR=%d%% flame=%s' % (f.voltage(), f.intensity(), f.flame()))
    time.sleep(1)
```
`voltage()` averages 16 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `flame()` reads DO. `intensity()` is a rough 0–100 % from AO (0 % = AO at the supply).

## Gotchas
- **AO is backwards**: it goes **down** as the flame gets stronger.
- **Check DO polarity on your board**: watch LED2 and DO with a lighter. The Joy-IT board gives HIGH on flame; many clones give LOW.
- **False alarms**: sunlight, incandescent and halogen bulbs and heaters all emit IR. Shade the sensor, and set the trimmer so LED2 is off in normal light.
- **Set the threshold**: hold a flame at the distance you care about and turn the trimmer until LED2 just lights.
- **Keep it at a safe distance**: it is a plastic part; never put it in the flame. It is not a certified fire alarm.

## Datasheet
https://www.ti.com/lit/ds/symlink/lm393.pdf (LM393 comparator on the board). Module: https://sensorkit.joy-it.net/en/sensors/ky-026
