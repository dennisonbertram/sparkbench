---
name: part-water-level-sensor
description: Pinout, electrical limits, wiring and MicroPython driver for the water level sensor module (red 3-pin S + - board with an S8050 transistor). Use when designing, wiring, simulating or writing code for a water level / water depth / rain sensor module in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Water level sensor module (S8050, S + -)

## Overview
The common red **Water Level Sensor** module (found in Elegoo and other Arduino starter kits) is a strip of ten interleaved bare copper traces with a small transistor circuit. It has no chip and no digital interface: it outputs an analog voltage on **S** that rises as more of the traces are under water.
- Five traces are fed from **+** through 100 Ω. The other five go to the base of an **S8050 NPN transistor**, wired as an emitter follower.
- The emitter is the **S** pin, loaded by 100 Ω to ground. Dry: S = 0 V. Wet: water carries base current and S rises, up to about **V(+) − 0.7 V** (one base-emitter drop).
- Sensing area about 40 × 16 mm. A power LED (with 1 kΩ) lights whenever the module is powered.
- The output depends on the water's conductivity and is not linear in depth, so it is **not calibrated in mm**. Calibrate it in your own tank.

## Pinout (header order, traces pointing down, parts facing you)
| Pin | Name | Function |
|---|---|---|
| 1 | S | Analog output (S8050 emitter) |
| 2 | + | Supply, 3.3–5 V |
| 3 | - | Ground |

## Electrical limits
- Supply: 3.3–5 V (vendors list 3.3–5 V or 5 V).
- Current: under about 25 mA (mostly the 100 Ω emitter load when fully wet, plus about 1 mA for the LED).
- S output: 0 V dry, up to about V(+) − 0.7 V wet: about 2.6 V on 3.3 V, about 4.3 V on 5 V.
- S8050 (UTC datasheet): VCEO 20 V, IC 700 mA max, hFE 100 or more at 1 mA. The module runs it far below these limits.
- Working temperature about 10–30 °C (Keyestudio spec for this style of sensor).

## Interface details
Read S with an ADC:
```
V(S) = raw / 65535 × 3.3   (read_u16 on a 3.3 V ADC)
```
- Dry reading: 0 V (allow some noise; treat anything above about 0.2 V as wet).
- Level: record S dry (`dry_v`) and at your "full" mark (`full_v`), then
  `level % = (V − dry_v) / (full_v − dry_v) × 100`. This is a rough, nonlinear estimate.

## Wiring
| Sensor | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| S | GPIO34 (ADC1) | GP26 / ADC0 | External ADC input (e.g. ADS1115 A0) |
| + | 3V3 | 3V3(OUT) | 3.3 V (pin 1) |
| - | GND | GND | GND |

The Raspberry Pi 4 has **no built-in ADC**, so it needs an external ADC such as an ADS1115 or MCP3008. On the ESP32, use ADC1 pins (GPIO32–39), because ADC2 stops working while Wi-Fi is on.

## Using the driver
```python
from waterlevel import WaterLevel
sensor = WaterLevel(26)          # S on GP26 (Pico) or 34 (ESP32)
v = sensor.voltage()
print('S=%.2fV %s' % (v, 'wet' if v > 0.2 else 'dry'))

sensor.calibrate(dry_v=0.0)      # call with the water at your "full" mark
print('%.0f %%' % sensor.level())
```
`WaterLevel(s, power=GPIO)` powers the module from a GPIO only while reading, which slows corrosion. Only do this if the pin can source about 25 mA. Otherwise switch + with a transistor.

## Gotchas
- **5 V supply on a 3.3 V board:** S can reach about 4.3 V, which can damage an ESP32 or Pico ADC pin. Power + from 3.3 V, or add a divider on S.
- **Corrosion:** constant power while wet eats the traces within days or weeks. Power the module only while reading.
- **Keep the electronics dry:** only the bare traces may go in the water.
- **Not a depth gauge:** tap, rain and distilled water give very different readings. Pure water barely conducts at all. Calibrate in the real liquid.
- **Noise:** average several ADC samples. The driver does 16 by default.

## Datasheet
S8050 transistor (UTC): https://components101.com/sites/default/files/component_datasheet/S8050%20Transistor%20Datasheet.pdf
Module circuit and pinout: https://lastminuteengineers.com/water-level-sensor-arduino-tutorial/
