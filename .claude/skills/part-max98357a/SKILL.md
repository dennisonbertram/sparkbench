---
name: part-max98357a
description: Pinout, electrical limits, wiring and MicroPython code for the MAX98357A I2S class-D mono amplifier (Analog Devices/Maxim MAX98357A, Adafruit 3006 breakout). Use when designing, wiring, simulating or writing code for a MAX98357A speaker amp in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# MAX98357A I2S class-D amplifier (MAX98357A)

## Overview
The **MAX98357A** takes digital I2S audio and drives a speaker directly: a DAC and a filterless class-D amplifier in one chip, no MCLK needed. Up to 3.2 W into 4 Ω (1.8 W into 8 Ω) at 5 V, 10 % THD. Hobbyists buy it as the **Adafruit I2S 3W Class D Amplifier Breakout - MAX98357A (product 3006)**: a 7-pin header plus a 2-pin speaker terminal block on the opposite edge.

## Pinout (Adafruit 3006, header pad 1 to 7)
Pad numbers from Adafruit's board file (JP1); pad 1 is Vin. Read left to right with the silkscreen upright, the labels run the other way: LRC, BCLK, DIN, GAIN, SD, GND, Vin.

| Pad | Pin | Function |
|---|---|---|
| 1 | Vin | Supply 2.5-5.5 V |
| 2 | GND | Ground |
| 3 | SD | SD_MODE shutdown / channel select (1 MΩ pull-up to Vin on the board) |
| 4 | GAIN | Gain: open 9 dB, GND 12 dB, 100 k to GND 15 dB, Vin 6 dB, 100 k to Vin 3 dB |
| 5 | DIN | I2S data in |
| 6 | BCLK | I2S bit clock (32, 48 or 64 x sample rate) |
| 7 | LRC | I2S word select (LRCLK): low = left, high = right |

Speaker: + / - terminal block (bridge-tied outputs, 4 Ω or more).

## Electrical limits
- Supply 2.5-5.5 V (absolute max 6 V). Quiescent 2.4 mA; up to about 650 mA at 5 V into 4 Ω, so Adafruit recommends a supply good for 800 mA. Sparkbench gives Vin its own 5 V supply with a common ground.
- Logic inputs: VIH 1.3 V, so 3.3 V GPIOs drive them directly; tolerant to 5.5 V. No outputs back to the microcontroller.
- Sample rates: 7.6-8.4, 15.2-16.8, 30.4-50.4 or 83.8-100.8 kHz. 22.05 kHz is NOT supported. 16/24/32-bit I2S.
- Shutdown current about 0.6 µA (SD below 0.16 V).

## Interface details
- Standard I2S (MAX98357A): left channel while LRCLK is low, data MSB-first one BCLK after the LRCLK edge.
- SD_MODE voltage picks the channel (chip has a 100 kΩ pull-down): < 0.16 V shutdown, 0.16-0.77 V (L+R)/2, 0.77-1.4 V right, > 1.4 V left. The board's 1 MΩ pull-up gives (L+R)/2 when SD is open (about 0.45 V at 5 V, 0.3 V at 3.3 V). Driving SD from a 3.3 V GPIO high selects LEFT only; low shuts down.
- Gain is sampled at power-up; power-cycle after changing GAIN.

## Wiring
- ESP32: LRC → GPIO25, BCLK → GPIO26, DIN → GPIO27, GND → GND, Vin → 5 V supply (GND common).
- Pico: BCLK → GP2, LRC → GP3 (ws must be sck + 1 on the Pico), DIN → GP6, GND → GND, Vin → 5 V supply.
- Raspberry Pi: BCLK → GPIO18 (pin 12), LRC → GPIO19 (pin 35), DIN → GPIO21 (pin 40), with the max98357a / hifiberry-dac overlay.

## Using it (no driver: built-in machine.I2S)
```python
from machine import I2S, Pin
import math, struct
audio = I2S(0, sck=Pin(26), ws=Pin(25), sd=Pin(27), mode=I2S.TX,
            bits=16, format=I2S.STEREO, rate=16000, ibuf=8000)
buf = bytearray(160 * 4)
for i in range(160):
    s = int(6000 * math.sin(2 * math.pi * 1000 * i / 16000))
    struct.pack_into('<hh', buf, i * 4, s, s)
for _ in range(200):
    audio.write(buf)   # 1 kHz tone for 2 s
audio.deinit()
```

## Gotchas
- Never connect a speaker wire to GND: both outputs switch (bridge-tied load).
- Send the same sample on left and right (STEREO) so it plays whatever the SD setting.
- 22.05 kHz audio is outside the chip's LRCLK ranges; resample to 16 or 44.1 kHz.
- Powering from 3.3 V gives about 1.3 W max into 4 Ω; brown-outs and resets usually mean the supply is too weak.
- Output is a ~330 kHz PWM square wave: drive moving-coil speakers only, not another amplifier input.

## Datasheet
https://www.analog.com/media/en/technical-documentation/data-sheets/MAX98357A-MAX98357B.pdf
