---
name: part-grove-gsr
description: Pinout, electrical limits, wiring and MicroPython driver for the Seeed Grove - GSR Sensor v1.2 (galvanic skin response, LM324 op-amp bridge, analog SIG output, Grove pins SIG/NC/VCC/GND). Use when designing, wiring, simulating or writing code for a Grove GSR sensor in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# Grove - GSR Sensor (LM324)

## Overview
The **Seeed Grove - GSR Sensor** (v1.2, SKU 101020052) measures the **resistance of the skin** between two nickel finger straps (plugged into the board's 2-pin JST socket). Sweat from strong emotion lowers skin resistance. The board turns it into a voltage with an **LM324** quad op-amp (circuit from Seeed's v1.2 schematic):
- R2/R7 (4.7k + 4.7k) make a reference **Vh = VCC/2**.
- Skin Rs to GND under **R6 200 kΩ** → V3 = Vh·Rs/(200k + Rs), buffered.
- Trimmer R1 (0–200 kΩ) to GND under R5 200 kΩ → V1 = Vh·Rp/(200k + Rp), buffered.
- Difference amplifier, gain 2 → **SIG = VCC·(Rs/(200k + Rs) − Rp/(200k + Rp))**, clipped at 0 V, then a **1 MΩ / 100 nF** filter (0.1 s).
- **Lower skin resistance → lower SIG.** Electrodes open → highest SIG (≈ VCC/2 after calibration).

Calibration (Seeed's procedure): with the straps **not worn**, turn the trimmer until SIG is lowest (trimmer fully up, SIG ≈ VCC/2). Call that Vcal. Then
**Rs = 200 kΩ · (V + VCC − Vcal) / (Vcal − V)**.
(Seeed's wiki prints `((1024 + 2·S)·10000)/(cal − S)`, the same shape for cal = 512 but scaled to a 20 kΩ bias; the board's schematic has R6 = 200 kΩ, so use 200 kΩ.)

## Pinout (Grove connector J3, pin 1 to 4, from Seeed's schematic)
| Pin | Name | Wire | Function |
|-----|------|------|----------|
| 1 | SIG | yellow | Analog output (through 1 MΩ) |
| 2 | NC | white | Not connected |
| 3 | VCC | red | Supply, 3.3–5 V |
| 4 | GND | black | Ground |

The finger straps go in the separate 2-pin JST 2.0 socket (J1) on the other edge.

## Electrical limits
- Supply: **3.3 V or 5 V** (Seeed spec; LM324 needs ≥ 3 V). On 3.3 V, SIG stays ≤ ~1.8 V (LM324 high limit VCC − 1.5 V), safe for any ADC.
- Current: LM324 0.7 mA typ / 1.2 mA max + 4.7k/4.7k divider (0.35 mA at 3.3 V): about 2 mA.
- On 5 V, SIG is ≈ 2.5 V when calibrated and can reach ~3.5 V if the trimmer is turned down; the 1 MΩ series resistor limits that to a few µA, so prefer 3.3 V with 3.3 V ADCs.
- SIG source resistance is **1 MΩ** (R9) with 100 nF to GND: sample slowly and average; never load SIG with a divider.

## Wiring
| Board | ESP32 | Raspberry Pi Pico | Raspberry Pi 4 |
|---|---|---|---|
| VCC | 3V3 | 3V3 (pin 36) | 3.3 V (pin 1) |
| GND | GND | GND | GND (pin 6) |
| SIG | GPIO32–39 (ADC1) | GP26/27/28 (ADC) | External ADC (e.g. ADS1115) |
| NC | – | – | – |

Use a Grove-to-female-jumper cable (the board has a 2 mm Grove socket). On the ESP32 use ADC1 pins (ADC2 stops working with Wi-Fi on).

## Using the driver
```python
from grove_gsr import GroveGSR
import time
gsr = GroveGSR(34, vcc=3.3)     # GPIO wired to SIG, module supply
gsr.calibrate()                 # straps NOT worn, trimmer turned for lowest SIG
while True:
    v = gsr.voltage()
    print('SIG=%.2fV R=%s' % (v, gsr.resistance(v)))
    time.sleep(0.5)
```
`voltage()` averages 10 readings 5 ms apart (Seeed's example); `resistance()` returns ohms, None when open, 0 when SIG is at the 0 V floor; `conductance_us()` gives µS; `raw10()` gives Seeed's 0–1023 scale.

## Gotchas
- **It reports resistance, not conductance** (Seeed's own caution). Sweatier = lower SIG.
- **Range**: with the trimmer at the calibration point, skin below ~200 kΩ drives SIG to 0 V. If SIG sits at 0 V when worn, turn the trimmer down slightly and calibrate again (Vcal then rises above VCC/2).
- **Slow output**: the 0.1 s filter means fast sampling just repeats the same value; GSR changes over seconds anyway.
- **Pass the real VCC** to the driver: the formula is ratiometric to the module supply.
- Not a medical device; values vary with strap contact and pressure.

## Datasheet
LM324: https://files.seeedstudio.com/wiki/Grove-GSR_Sensor/res/Lm324.pdf. Board: https://wiki.seeedstudio.com/Grove-GSR_Sensor/ and schematic https://files.seeedstudio.com/wiki/Grove-GSR_Sensor/res/Grove-GSR_Eagle_File_V1.2.zip
