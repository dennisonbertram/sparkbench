---
name: part-sparkfun-qwiic-dual-ssr
description: Pinout, electrical limits, wiring and MicroPython driver for the SparkFun Qwiic Dual Solid State Relay (COM-16810; ATtiny84 I2C controller + two TE SSRF-240D25 zero-cross AC solid state relays, address 0x0A). Use when designing, wiring, simulating or writing code for a Qwiic Dual SSR in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# SparkFun Qwiic Dual Solid State Relay (COM-16810)

## Overview
The **SparkFun Qwiic Dual Solid State Relay** switches two AC loads with **TE SSRF-240D25** solid state relays (SPST-NO, zero-voltage turn-on, 12–280 VAC, 10 A each with convection cooling, 25 A only with forced air). An **ATtiny84** running SparkFun's dual-SSR firmware listens on I2C and drives each relay input from 3.3 V through a transistor, so only SDA/SCL are needed. Connect it with a Qwiic cable or the 5-pin 0.1" header; each load goes on its own 2-way screw terminal on the far edge (so the board is wired with jumper leads, not plugged into a breadboard).

## Pinout (0.1" header, as printed on the board)
| Pin | Function |
|---|---|
| GND | Ground |
| 3V3 | Supply, 3.3 V (about 20 mA per relay that is on) |
| SDA | I2C data (4.7 k pull-up on board) |
| SCL | I2C clock (4.7 k pull-up on board) |
| RST | ATtiny84 reset, active low (4.7 k pull-up); leave open |

Screw terminals (far edge): one 2-way terminal per relay, the switched AC side, isolated (4 kV) from the logic.

## Electrical limits
- Supply: 3.3 V (3.2–3.6 V). No regulator; the I2C pull-ups go to this pin, so never 5 V on a 3.3 V microcontroller.
- SSR input: 3–15 VDC, must-operate 3.0 V, ~300 Ω; the board feeds it from 3V3 through 47 Ω and a transistor.
- Load: AC only, 12–280 VAC, 0.06–10 A per relay without a fan (25 A with forced air), off-state leakage ≤ 0.1 mA, turn-on/off within one half-cycle (8.3 ms at 60 Hz).

## Interface details
- **I2C address 0x0A** (ADR jumper closed, default), **0x0B** (ADR jumper cut), or any 0x08–0x77 stored with `0xC7 <addr>` (used while the jumper is closed).
- Byte commands (no register map):
  - `0x01` / `0x02` toggle relay 1 / 2. There is no per-relay on or off command.
  - `0x05` / `0x06` then read 1 byte: status, `0x0F` = on, `0x00` = off.
  - `0x0A` all off, `0x0B` all on.
  - `0x10` / `0x11` `<n>`: slow 1 Hz PWM, on for n/120 s each second (0–120, 0 = no PWM). Write the code alone and read 1 byte to get n back.
- `on()`/`off()` read the status and toggle only if needed (as SparkFun's library does).
- No firmware-version command on this board.

## Wiring
- ESP32: 3V3 → 3V3, GND → GND, SDA → D21, SCL → D22.
- Pico: 3V3 → 3V3(OUT), GND → GND, SDA → GP4, SCL → GP5.
- Raspberry Pi 4: 3V3 → pin 1, GND → pin 6, SDA → pin 3, SCL → pin 5.

## Using the driver
```python
from machine import I2C, Pin
from qwiic_dual_ssr import QwiicDualSSR
i2c = I2C(0, sda=Pin(21), scl=Pin(22))
ssr = QwiicDualSSR(i2c)      # 0x0A
ssr.on(1)
print(ssr.state(1), ssr.state(2))   # 1 0
ssr.all_off()
```

## Gotchas
- **AC only.** An SCR-output SSR will not switch off a DC load.
- Do not send the firmware's toggle-all command `0x0C`: it updates the status bytes but writes the wrong ATtiny pins, so relays and status get out of step. `toggle_all()` toggles each relay instead.
- While any relay runs slow PWM, relays left at PWM 0 are forced off every period; set PWM back to 0 on all relays before using on/off again.
- The simulator stores PWM values but does not pulse the outputs.
- Mains is dangerous: cut one wire of the load cable and land both ends on one relay's terminal, plug pulled. Never touch the board while it is plugged in.
- Many pulled-up Qwiic boards on one bus: cut the I2C jumper on all but one.

## Datasheet
https://cdn.sparkfun.com/assets/7/4/5/8/7/SSRF_Data_Sheet_0409.pdf (relay) ·
https://cdn.sparkfun.com/assets/6/8/4/0/a/Qwiic_Dual_Solid_State_Relay_Schematic.pdf (schematic) ·
https://learn.sparkfun.com/tutorials/sparkfun-qwiic-dual-solid-state-relay-hookup-guide/all ·
https://github.com/sparkfun/Qwiic_Dual_Solid_State_Relay (firmware)
