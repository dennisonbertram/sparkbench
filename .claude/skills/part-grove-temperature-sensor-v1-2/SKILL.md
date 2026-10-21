---
name: part-grove-temperature-sensor-v1-2
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - Temperature Sensor v1.2 (Murata NCP18WF104F03RC 100 kΩ NTC thermistor, B 4250 K, in a 100 kΩ divider with an op-amp buffer). Use when designing, wiring, simulating or writing code for a Grove Temperature Sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - Temperature Sensor v1.2 (Seeed 101020015)

## Overview
The **Seeed Studio Grove - Temperature Sensor v1.2** (SKU 101020015) is a small blue Grove board with a 4-pin Grove connector. It carries a **Murata NCP18WF104F03RC** SMD NTC thermistor (100 kΩ ±1 % at 25 °C, B25/50 = 4250 K) and a fixed **100 kΩ 1 %** resistor wired as a voltage divider, buffered by an **LMV358** op-amp voltage follower.
- Circuit (Seeed schematic): **VCC → NTC → node → 100 kΩ → GND**, node → op-amp follower → **SIG**
- Warmer = lower NTC resistance = **higher voltage on SIG**. At 25 °C, SIG sits at half the supply.
- Range: −40 °C to +125 °C, about ±1.5 °C (Seeed); the response is **not linear**.

## Pinout (Grove connector, as printed on the board)
| Pin | Name | Function |
|-----|------|----------|
| 1 | SIG | Buffered divider output (yellow wire), connect to an ADC pin |
| 2 | NC | Not connected (white wire) |
| 3 | VCC | Supply, 3.3–5 V (red wire) |
| 4 | GND | Ground (black wire) |

The connector is a 2 mm Grove socket, not header pins: use a Grove-to-female-jumper cable (or a Grove shield) to reach a breadboard.

## Electrical limits
- Supply: **3.3–5 V** (Seeed). The divider draws Vcc / (100 kΩ + R_ntc), about 17 µA at 25 °C on 3.3 V; the LMV358 adds roughly 0.2 mA.
- SIG swings between 0 V and the supply. **On an ESP32, Pico or Raspberry Pi, power VCC from 3.3 V** so SIG can never go above 3.3 V (it rises towards VCC when hot).
- Self-heating is negligible: the thermistor sees at most ~25 µW (dissipation constant 1 mW/°C).

## Interface details
From the Seeed schematic and the Murata NCP18WF104 datasheet:
```
R_ntc = 100 kΩ × (Vcc / V_SIG − 1)
1 / T(K) = 1 / 298.15 + ln(R_ntc / 100 kΩ) / 4250
T(°C) = T(K) − 273.15
```
Seeed's Arduino demo writes the same thing with ADC counts: `R = R0 × (1023 / a − 1)` and uses B = 4275 K (the middle of the "4250–4299 K" range on the wiki); the difference is about 0.3 °C near room temperature. The driver takes `beta=` if you prefer 4275.
Examples at Vcc = 3.3 V: 1.65 V = 25 °C, 2.20 V ≈ 40.2 °C (R = 50 kΩ), 1.20 V ≈ 13.7 °C (R = 175 kΩ), 2.50 V ≈ 50.9 °C (R = 32 kΩ).
The result is ratiometric: use the actual voltage on VCC as Vcc.

## Wiring
| Module | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC (red) | 3V3 | 3V3(OUT) (pin 36) | 3.3 V (pin 1) |
| GND (black) | GND | GND | GND (pin 6) |
| SIG (yellow) | GPIO32–39 (ADC1) | GP26 / ADC0 (pin 31) | External ADC (e.g. Grove Base Hat A0 or ADS1115) |
| NC (white) | — | — | — |

On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on). The Raspberry Pi has no ADC.

## Using the driver
```python
from grove_temp import GroveTemp
import time
sensor = GroveTemp(26)        # GPIO number of the ADC pin SIG is wired to; vcc=3.3 by default
while True:
    print('T=%.1fC' % sensor.temperature())
    time.sleep(1)
```
`voltage()` averages 32 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V / 65535), `resistance()` gives the NTC resistance in Ω, `temperature()` the temperature in °C. If the module runs from 5 V into a 5 V-capable ADC, pass `vcc=5.0`.

## Gotchas
- **Formula direction**: this board has the thermistor on the VCC side, the opposite of the KY-013. SIG goes *up* when warm. Using a KY-013 formula gives readings that fall when you warm it.
- **5 V supply + 3.3 V board** can put up to 5 V on the ADC pin when it is hot. Use 3.3 V.
- **Wrong B / R0**: this is a 100 kΩ thermistor, not 10 kΩ. Using 10 kΩ / 3950 K constants gives nonsense.
- **ESP32 ADC** is nonlinear near 0 V and near the top, so very cold (SIG < 0.15 V, below about −35 °C) and very hot readings are poor without calibration.
- Older v1.0 boards use a different thermistor (B = 3975 K, 10 kΩ); this driver is for v1.1 / v1.2.

## Datasheet
https://files.seeedstudio.com/wiki/Grove-Temperature_Sensor_V1.2/res/NCP18WF104F03RC.pdf (Murata NTC thermistor catalogue). Schematic: https://files.seeedstudio.com/wiki/Grove-Temperature_Sensor_V1.2/res/Grove_-_Temperature_sensor_v1.1.pdf. Module documentation: https://wiki.seeedstudio.com/Grove-Temperature_Sensor_V1.2/
