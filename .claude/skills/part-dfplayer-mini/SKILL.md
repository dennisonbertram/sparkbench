---
name: part-dfplayer-mini
description: Pinout, electrical limits, wiring and MicroPython driver for the DFPlayer Mini serial MP3 player module (DFRobot DFR0299, FN-M16P compatible). Use when designing, wiring, simulating or writing code for a DFPlayer Mini in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# DFPlayer Mini MP3 player (DFR0299)

## Overview
The **DFPlayer Mini** plays MP3/WAV files from a micro SD card (FAT16/FAT32, up to 32 GB) or a USB stick, and has a built-in amplifier for a speaker under 3 W. It is controlled over a 9600-baud UART with 10-byte command frames, or with buttons (IO_1/IO_2, ADKEY). Hobbyists buy the **DFRobot DFPlayer Mini (DFR0299)** or one of the many same-pinout clones.

## Pinout (16 pins, two rows; DIP numbering)
| # | Pin | Function |
|---|---|---|
| 1 | VCC | Supply, 3.2–5.0 V (typ. 4.2 V) |
| 2 | RX | Serial input, 3.3 V TTL (from board TX via 1 kΩ) |
| 3 | TX | Serial output, 3.3 V TTL (to board RX) |
| 4 | DAC_R | Line/headphone out, right |
| 5 | DAC_L | Line/headphone out, left |
| 6 | SPK_1 | Speaker output |
| 7 | GND | Ground |
| 8 | SPK_2 | Speaker output |
| 9 | IO_1 | Button to GND: previous / long = volume down |
| 10 | GND | Ground (named GND2 in Sparkbench) |
| 11 | IO_2 | Button to GND: next / long = volume up |
| 12 | ADKEY_1 | AD key input 1 |
| 13 | ADKEY_2 | AD key input 2 |
| 14 | USB+ | USB D+ |
| 15 | USB- | USB D- |
| 16 | BUSY | Low while playing, high when idle |

Pins 1–8 run down one edge (VCC at the top), pins 9–16 run up the other edge (IO_1 at the bottom, BUSY at the top).

## Electrical limits
- Supply 3.2–5.0 V; under 15 mA idle, a few hundred mA when driving a speaker loudly.
- UART pins are 3.3 V TTL; from a 5 V board put 1 kΩ in series with RX.
- Speaker: under 3 W, 4–8 Ω, between SPK_1 and SPK_2 (bridged output: never ground either).

## Interface details
- 9600 baud, 8N1. Frame: `7E FF 06 CMD FB MSB LSB CHK_H CHK_L EF`.
- FB = 1 asks for an ACK frame (CMD 0x41); 0 = no ACK.
- Checksum = 0xFFFF − (FF + 06 + CMD + FB + MSB + LSB) + 1, i.e. minus the sum of those 6 bytes, as 16 bits. Example: query volume = `7E FF 06 43 00 00 00 FE B8 EF`.
- Controls: 0x01 next, 0x02 previous, 0x03 play track n, 0x06 volume 0–30, 0x07 EQ 0–5, 0x0D play, 0x0E pause, 0x0F folder/track, 0x12 MP3-folder track, 0x16 stop, 0x0C reset.
- Queries reply with the same CMD and the value in MSB/LSB: 0x42 status (MSB 1 USB / 2 SD / 0x10 sleep, LSB 0 stopped / 1 playing / 2 paused), 0x43 volume, 0x44 EQ, 0x48 SD root track count, 0x4C current SD track, 0x4E tracks in folder, 0x4F folder count.
- Unsolicited frames: 0x3F ready (after power-on), 0x3D SD track finished, 0x3A card inserted, 0x40 error code.

## Wiring
- ESP32: VCC → 5V (VIN), GND → GND, RX → 1 kΩ → GPIO17 (UART2 TX), TX → GPIO16 (UART2 RX), speaker across SPK_1/SPK_2.
- Pico: VCC → VBUS, GND → GND, RX → 1 kΩ → GP4 (UART1 TX), TX → GP5 (UART1 RX).
- Raspberry Pi: VCC → pin 2 (5 V), GND → pin 6, RX → 1 kΩ → pin 8 (TXD), TX → pin 10 (RXD).

## Using the driver
```python
from machine import UART, Pin
import time
from dfplayer import DFPlayer
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
time.sleep_ms(1500)          # let it read the card
df = DFPlayer(uart)
df.set_volume(20)
df.play(1)                   # first file copied to the card
print(df.sd_track_count(), df.volume(), df.status())
```

## Gotchas
- Track numbers follow the order files were copied to the card, not their names. Copy files in order, or use folders `01`…`99` with `001.mp3`… (play_folder) or a folder `MP3` with `0001.mp3`… (play_mp3_folder).
- Commands sent before the module finishes initialising (0.5–1.5 s) are ignored.
- Clicks, resets or no sound: weak supply. Add 100 µF+ across VCC/GND and power from 5 V.
- Some clone chips answer queries slowly or twice; the driver skips unrelated frames and checks every checksum.
- In the simulator, query replies come from the sliders; playback commands do not change them.

## Datasheet
https://raw.githubusercontent.com/DFRobot/DFRobotDFPlayerMini/master/doc/FN-M16P%2BEmbedded%2BMP3%2BAudio%2BModule%2BDatasheet.pdf
