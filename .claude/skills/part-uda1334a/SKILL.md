---
name: part-uda1334a
description: Pinout, electrical limits, wiring and MicroPython code for the Adafruit I2S Stereo Decoder - UDA1334A breakout (product 3678, NXP UDA1334ATS DAC with PLL, line-level stereo out). Use when designing, wiring, simulating or writing code for a UDA1334A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# UDA1334A I2S stereo DAC (Adafruit 3678)

## Overview
The **NXP UDA1334ATS** is a low-power stereo audio DAC. Its built-in PLL locks to the word-select clock, so it needs no master clock: just **BCLK, WSEL (LRCLK) and DIN**. It gives a **line-level** stereo output (about 0.9 V RMS full scale), enough for headphones or an amplifier input but not a bare speaker. Hobbyists buy it on the **Adafruit I2S Stereo Decoder - UDA1334A breakout** (product 3678), which adds a 3.3 V regulator (3-5 V in), 3.5 mm jack, output filter and 10k pull-downs on every control pin.

## Pinout (Adafruit 3678, header by header as printed)
Power / I2S / line-out header (9 pins):
| Pin | Function |
|---|---|
| VIN | Supply in, 3-5 V |
| 3VO | 3.3 V regulator OUTPUT, leave unconnected |
| GND | Ground |
| WSEL | I2S word select / LRCLK |
| DIN | I2S data in |
| BCLK | I2S bit clock |
| Lout | Left line out |
| AGND | Analog ground for the line outputs |
| Rout | Right line out |

Control header (6 pins, all 10k pull-down, all optional):
| Pin | Function |
|---|---|
| SCLK | 27 MHz sysclk in video mode; in audio mode low = 16-50 kHz, high = 50-100 kHz |
| SF1 | Format select 1 (low/low with SF0 = I2S) |
| MUTE | High = soft mute |
| SF0 | Format select 0 (3.3 V logic only) |
| PLL | PLL mode, low = audio mode (3-level input, 3.3 V logic only) |
| DEEM | High = 44.1 kHz de-emphasis on |

## Electrical limits
- Board supply 3-5 V on VIN; the chip itself runs at 2.4-3.6 V (absolute max 4.0 V), fed by the onboard MIC5225-3.3.
- Current: about 6 mA (3.5 mA analog + 2.5 mA digital, audio mode).
- WSEL, DIN, BCLK, SCLK, SF1, MUTE, DEEM are 5 V tolerant; PLL and SF0 are not.
- BCLK at most 64 x WSEL. All formats: WS changes on the falling BCLK edge (standard I2S does this).

## Interface details
- Defaults (pins open): Philips I2S format, 16-24 bit, audio mode, rate range 16-50 kHz, not muted.
- MicroPython's `machine.I2S` in TX mode, 16-bit STEREO (or MONO), at 22050 or 44100 Hz works directly; no driver needed.
- SF1/SF0: LL = I2S, LH = LSB-justified 16 bit, HL = 20 bit, HH = 24 bit.

## Wiring
- ESP32: VIN → 3V3 (or 5V), GND → GND, BCLK → D27, WSEL → D25, DIN → D26.
- Pico: VIN → 3V3(OUT), GND → GND, BCLK → GP2, WSEL → GP3 (must be the pin after BCLK), DIN → GP6.
- Raspberry Pi: VIN → 3.3 V, GND → GND, BCLK → GPIO18 (pin 12), WSEL → GPIO19 (pin 35), DIN → GPIO21 (pin 40); use the hifiberry-dac overlay.
- Audio out: headphones in the 3.5 mm jack, or Lout/Rout/AGND to an amplifier input.

## Example
```python
from machine import I2S, Pin
import math, struct
RATE = 22050
audio = I2S(0, sck=Pin(27), ws=Pin(25), sd=Pin(26), mode=I2S.TX,
            bits=16, format=I2S.STEREO, rate=RATE, ibuf=8000)
N = RATE // 441 * 4
buf = bytearray(N * 4)
for i in range(N):
    s = int(8000 * math.sin(2 * math.pi * 441 * i / RATE))
    struct.pack_into('<hh', buf, i * 4, s, s)
while True:
    audio.write(buf)
```

## Gotchas
- No sound: check that WSEL and BCLK are not swapped, and that the rate is 16-50 kHz with SCLK low.
- It is a line driver, not an amplifier: a speaker needs an amp (e.g. PAM8302) after it.
- Hum: return the amplifier's ground to AGND.
- Don't feed 5 V logic into PLL or SF0.

## Datasheet
https://www.nxp.com/docs/en/data-sheet/UDA1334ATS.pdf
