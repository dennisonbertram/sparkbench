---
name: part-pcm5102a
description: Pinout, electrical limits, wiring and MicroPython code for the PCM5102A I2S stereo line-out DAC (Texas Instruments PCM5102A, GY-PCM5102 purple module with 3.5 mm jack). Use when designing, wiring, simulating or writing code for a PCM5102A in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# PCM5102A I2S stereo DAC (PCM5102A)

## Overview
The **PCM5102A** from Texas Instruments is a 32-bit, 8–384 kHz stereo audio DAC with an I2S input and a 2.1 V RMS ground-centred line output. Its internal PLL builds the system clock from BCK, so it works with just three signal wires. Hobbyists buy it on the **GY-PCM5102 purple module**, which has a 3.5 mm stereo jack and onboard 3.3 V regulators. The output is line level: plug it into an amplifier, powered speakers or headphones, not a bare speaker.

## Pinout (GY-PCM5102 module, header order)
| Pin | Function |
|---|---|
| VIN | Module supply, 3.3–5 V (onboard LDOs feed the chip's 3.3 V rails) |
| GND | Ground |
| LCK | LRCK / word select (I2S WS) |
| DIN | Serial audio data (I2S SD out of the MCU) |
| BCK | Bit clock (I2S SCK/BCLK of the MCU) |
| SCK | System clock input: tie to GND so the PLL runs from BCK |

Back-side solder jumpers: H1L FLT (low = normal filter), H2L DEMP (low = de-emphasis off), H3L XSMT (**high = play**, low = soft mute), H4L FMT (low = I2S).

## Electrical limits
- Chip: AVDD 3.0–3.6 V, DVDD 3.0–3.6 V (or 1.8 V); the module's regulators take 3.3–5 V on VIN.
- Logic inputs: VIH ≥ 0.7 × DVDD (2.3 V), so 3.3 V MCU pins drive it directly. Nothing on the header drives back toward the MCU.
- Current: about 20 mA playing.
- Sample rate 8–384 kHz; output 2.1 V RMS full scale into ≥ 1 kΩ.

## Interface details
- Standard I2S (Philips), 16/24/32-bit, MCU is the clock master.
- 3-wire mode: with SCK held at ground and BCK/LRCK running for 16 LRCK periods, the PLL starts. It needs **BCK = 32 or 64 × fs and BCK ≥ 1.024 MHz** (datasheet Table 11): e.g. 44.1 kHz 16-bit stereo (1.4112 MHz) or 48 kHz 32-bit (3.072 MHz). 8 kHz, and 16 kHz at 16-bit, do not lock.
- Clocks stopped for over 1 s: automatic power-down; it powers back up when valid clocks return.
- No driver needed: use `machine.I2S` directly.

## Wiring
- ESP32: VIN → 3V3 (or 5V), GND → GND, SCK → GND, BCK → GPIO27, LCK → GPIO25, DIN → GPIO26.
- Pico: VIN → 3V3(OUT) (or VSYS), GND → GND, SCK → GND, BCK → GP2, LCK → GP3 (WS must be the pin after SCK), DIN → GP6.
- Raspberry Pi: VIN → pin 2 (5 V), GND → pin 6, SCK → GND, BCK → pin 12 (GPIO18), LCK → pin 35 (GPIO19), DIN → pin 40 (GPIO21); enable the `hifiberry-dac` overlay.

## Example (441 Hz tone)
```python
from machine import I2S, Pin
import math, struct
RATE = 44100
audio = I2S(0, sck=Pin(27), ws=Pin(25), sd=Pin(26), mode=I2S.TX, bits=16, format=I2S.STEREO, rate=RATE, ibuf=8000)
N = RATE // 441
buf = bytearray(N * 4)
for i in range(N):
    s = int(8000 * math.sin(2 * math.pi * i / N))
    struct.pack_into('<hh', buf, i * 4, s, s)
while True:
    audio.write(buf)
```

## Gotchas
- Silence with everything wired: XSMT (H3L) is not bridged high, SCK is floating instead of grounded, or the BCK rate is too low for the PLL.
- Distorted or hissy sound on 3.3 V: feed VIN from 5 V so the LDOs have headroom.
- It is a DAC, not an amplifier: a speaker needs an amp (e.g. PAM8403) after it.

## Datasheet
https://www.ti.com/lit/ds/symlink/pcm5102a.pdf
