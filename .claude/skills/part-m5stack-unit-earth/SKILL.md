---
name: part-m5stack-unit-earth
description: Pinout, electrical limits, wiring and MicroPython driver for the M5Stack Unit Earth soil moisture sensor (SKU U019: resistive two-probe sensor with LM393 comparator, analog Ain + digital Din on an HY2.0-4P Grove port). Use when designing, wiring, simulating or writing code for a Unit Earth in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# M5Stack Unit Earth soil moisture sensor (U019)

## Overview
The **M5Stack Unit Earth (SKU U019)** is a resistive soil-moisture sensor. It has two bare probes that go into the soil and a 4-pin HY2.0 (Grove-style) socket. From the M5Stack V1.0 schematic:
- An **HT7533** regulator makes **3.3 V** from the 5 V port pin. Everything else runs on that 3.3 V.
- The probes sit between **Ain** and GND, with **R1 10 kΩ** from Ain to 3.3 V. In air or dry soil Ain is about **3.3 V**. Wetter soil conducts better, so **Ain falls**.
- An **LM393** comparator compares Ain (+ input) with the wiper of a **10 kΩ trimmer** (− input). Its open-collector output **Din** has **R2 10 kΩ** to 3.3 V. **Din is HIGH when dry and LOW when wet** (Ain below the threshold).
- There are no LEDs on the board.

## Pinout (HY2.0-4P cable, colour order)
| Wire | Pin | Function |
|---|---|---|
| Black | GND | Ground |
| Red | 5V | Supply, 5 V nominal (into the HT7533) |
| Yellow | Din | Digital output, 3.3 V logic, LOW = wet (J1 pin 2) |
| White | Ain | Analog output, 0–3.3 V, lower = wetter (J1 pin 1) |

Sources: M5Stack docs PinMap (Black GND, Red 5V, Yellow Digital Output, White Analog Output; PORT.B) and the U019 schematic (J1: 1 Ain, 2 Din, 3 VCC, 4 GND).

## Electrical limits
- Supply: 5 V from the port (3.3 V in also works; the regulator then passes about 3.2 V). About 2 mA.
- Ain and Din both come from the unit's own 3.3 V rail, so they are **safe for 3.3 V GPIOs** even with 5 V supply.
- Ain has a 10 kΩ source impedance: fine for the ESP32 / Pico ADC.

## Interface details
```
Ain = 3.3 V × R_soil / (R_soil + 10 kΩ)     (dry soil: R_soil large -> ~3.3 V)
Din = HIGH if Ain > trimmer voltage, LOW if Ain < trimmer voltage
```
M5Stack publishes no volts-to-moisture formula. Record your own dry and wet readings.

## Wiring
| Unit Earth | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| 5V (red) | 5V / VIN | VBUS (pin 40) | 5 V (pin 2) |
| GND (black) | GND | GND | GND |
| Din (yellow) | any GPIO, e.g. GPIO26 | any GP, e.g. GP2 | any GPIO, e.g. GPIO17 |
| Ain (white) | GPIO32–39 (ADC1), e.g. GPIO36 | GP26/27/28 (ADC) | External ADC (ADS1115 / MCP3008) |

On an M5Stack Core it plugs straight into PORT.B (G26 = Din, G36 = Ain). On the ESP32 use ADC1 pins (ADC2 does not work while Wi-Fi is on).

## Using the driver
```python
from m5_earth import UnitEarth
import time
earth = UnitEarth(36, 26)       # Ain GPIO, Din GPIO
while True:
    print('Ain=%.2fV moisture=%d%% wet=%s' % (earth.voltage(), earth.moisture(), earth.wet()))
    time.sleep(1)
```
`voltage()` averages 16 samples (`read_uv()` on ESP32, else `read_u16()` × 3.3 V). `moisture()` is a rough 0–100 % (0 % = Ain at 3.3 V). `wet()` is True when Din is LOW.

## Gotchas
- **Backwards from what you expect**: Ain goes **down** with water and Din is **active LOW**.
- **Not corrosion-proof**: M5Stack says the electrodes are for proof of concept only; do not leave them in damp soil for long. DC through the soil corrodes them.
- **Set the threshold**: put the probes in soil at your "needs water" level and turn the trimmer until Din just changes.
- Keep the board and connector out of the soil and water.

## Datasheet
https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/728/U019_UNIT_EARTH_SCHE.pdf (schematic). Product page: https://docs.m5stack.com/en/unit/earth. Comparator: https://www.ti.com/lit/ds/symlink/lm393.pdf
