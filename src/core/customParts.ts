// Components added from a datasheet (by the AI) rather than hand-modelled in parts.ts.
// A CustomPartSpec is plain JSON: it lives in the project file and in the part's skill folder
// (.claude/skills/part-<slug>/part.json), and is turned into a PartDef at runtime.
import type { PartDef, PinDef, Project, SimControl } from './types';
import { checkSolve, withPromCrc } from './calibration';

export type CustomInterface = 'i2c' | 'spi' | 'analog' | 'digital-in' | 'digital-out' | 'pwm' | 'uart' | 'onewire' | 'power' | 'passive';

export interface CustomSim {
  /**
   * analog-sensor: drives `outputPin` with a voltage set by a slider
   * digital-sensor: drives `outputPin` high/low with a toggle
   * actuator: shows "on" when `inputPin` is driven high
   * i2c-device: answers at its address with a register map
   * onewire-temp: a DS18x20-family thermometer on the 1-Wire bus (MicroPython's onewire + ds18x20 modules)
   * oled-display: a monochrome OLED (SSD1306/SH1106 command set) on I2C, or on 4-wire SPI with bus 'spi'; tests can read its text
   * char-lcd: an HD44780 character LCD behind a PCF8574 I2C backpack (see lcd); tests read its text
   * hx711: a 24-bit bridge ADC read by clocking PD_SCK and sampling DOUT (HX711/HX710 load-cell amplifiers)
   * spi-device: a chip read over SPI (thermocouple/RTD amplifiers, SPI ADCs); pins use fn spi.sck/spi.miso/spi.mosi/spi.cs
   * uart-device: a serial module (GPS, particulate, CO2); its TX pin has fn uart.tx, its RX pin fn uart.rx
   * keypad-matrix: a passive row/column key matrix (4×4, 3×4 membrane keypads)
   * dht-sensor: a DHT11/DHT22/AM2302-style single-wire sensor read with MicroPython's dht module (outputPin = DATA;
   *   "value" = temperature, a "humidity" control); servo: an RC servo on a PWM pin (see servo)
   * segment-display: a 7-segment or 8×8 LED display driven by a TM1637 or MAX7219 (tests read the digits as text)
   * rfid-reader: a 13.56 MHz MFRC522 (RC522) reader on SPI (fn spi.sck/spi.mosi/spi.miso/spi.cs, RST fn reset) with one
   *   ISO 14443-A card: toggle "present" puts it on the reader, the "value" slider is its 4-byte UID (see rfid)
   * ir-receiver: a 38 kHz IR receiver (VS1838B, TSOP38238) whose active-low output (outputPin) carries remote-control
   *   frames: holding the "press" toggle sends the "value" button code to the "address" (see ir)
   * pulse-sensor: outputPin gives a square wave whose frequency follows the "value" slider (flow meters, tachometers; see pulse)
   * ultrasonic: a trigger/echo rangefinder: a pulse on echo.trigPin starts a measurement and outputPin (ECHO) goes high
   *   for the sound's round trip to the "value" distance (see echo); works with machine.time_pulse_us and polling
   * resistive-sensor: the sensor is a resistance (gas sensor element, LDR, thermistor, FSR) or a shunt voltage reference
   *   (LM335), not a voltage source: see resistive / shunt, and give the pin the load or bias resistor it needs (pin load)
   * i2s-amp: an I2S audio amplifier (MAX98357A) fed by machine.I2S: pins fn i2s.bclk, i2s.lrc and i2s.din; tests hear what
   *   it plays with what "buzzer" (the dominant pitch). See i2sAmp for the SD_MODE channel select.
   */
  kind: 'analog-sensor' | 'digital-sensor' | 'actuator' | 'i2c-device' | 'onewire-temp' | 'oled-display' | 'char-lcd' | 'hx711' | 'spi-device' | 'uart-device' | 'keypad-matrix' | 'segment-display' | 'addressable-led' | 'tft-display' | 'dht-sensor' | 'servo' | 'shift-register' | 'rfid-reader' | 'ir-receiver' | 'pulse-sensor' | 'ultrasonic' | 'resistive-sensor' | 'i2s-amp' | 'none';
  /** i2s-amp: sdPin = the SD_MODE pin; its voltage picks the channel (MAX98357A: < 0.16 V shutdown, 0.16–0.77 V (L+R)/2,
   * 0.77–1.4 V right, > 1.4 V left; the chip pulls it down with 100 kΩ). sdPullUpOhms = a pull-up the board fits from SD
   * to the supply (Adafruit's breakout: 1 MΩ, giving (L+R)/2 when SD is left open). No sdPin: plays (L+R)/2. */
  i2sAmp?: { sdPin?: string; sdPullUpOhms?: number };
  /** pulse-sensor: frequency = value × hzPerUnit + offsetHz (YF-S201: 7.5 Hz per L/min; a tachometer: pulses per turn / 60
   * per RPM), capped at maxHz (default 2000); duty = fraction of each period spent high (default 0.5). openDrain: the
   * output only pulls low (open collector), so the high level comes from a pull-up (pin pullUp, or Pin.PULL_UP). No
   * pulses while the frequency is 0 or the part is unpowered. */
  pulse?: { hzPerUnit: number; offsetHz?: number; duty?: number; openDrain?: boolean; maxHz?: number };
  /** ultrasonic: TRIG is trigPin, ECHO is outputPin. A trigger pulse of at least triggerUs (default 10) starts a
   * measurement; delayUs later (default 450, the 40 kHz burst) ECHO goes high for distance × usPerCm (default 58.3:
   * 2 / 343 m/s). Distances are clamped to minCm…maxCm, except that past maxCm the echo lasts beyondUs if given (the
   * sensor's timeout pulse; leave it out if the sensor reports maxCm). The "value" slider is the distance in cm. */
  echo?: { trigPin: string; minCm: number; maxCm: number; usPerCm?: number; delayUs?: number; triggerUs?: number; beyondUs?: number };
  /** resistive-sensor: each entry is a resistance from `pin` to `to` (another pin; default the part's GND) set by a
   * control (default "value"): curve 'linear' or 'log' between rAtMin and rAtMax over the control's range; 'ntc'
   * R = r0·exp(beta·(1/T − 1/(t0+273.15))) with T in kelvin from the control in °C (t0 default 25); 'power'
   * R = rRef·(value/ref)^exponent (LDRs: exponent ≈ −0.7 with value in lux; gas sensors: Rs from the datasheet's
   * log-log curve). */
  resistive?: { pin: string; to?: string; control?: string; curve: 'linear' | 'log' | 'ntc' | 'power'; rAtMin?: number; rAtMax?: number; r0?: number; beta?: number; t0?: number; rRef?: number; ref?: number; exponent?: number }[];
  /** resistive-sensor: a shunt voltage reference between `pin` (+) and `to` (−, default GND), like a zener: once the
   * bias resistor (pin load) pushes enough current through it, it holds vAtMin…vAtMax over the control's range
   * (LM335: 10 mV/K) with dynamic impedance rz (default 1 Ω); below minUa (default 400) the reading is not valid
   * and the simulator warns. It never sources current, so with too little bias the pin just follows the resistor. */
  shunt?: { pin: string; to?: string; control?: string; vAtMin: number; vAtMax: number; rz?: number; minUa?: number };
  /** i2c-device with 16-bit registers: the byte order of each word on the bus (default 'msb', high byte first). */
  wordOrder?: 'msb' | 'lsb';
  /** i2c-device: SMBus packet error checking. Every word read is followed by a CRC-8 (poly 0x07, init 0) over the
   * address byte (write), the command, the address byte (read) and the data bytes, and writes must end with one over
   * the address byte, command and data, or the chip ignores them (LC709203F). */
  pec?: boolean;
  /** shift-register: '595' = serial-in/parallel-out (data, clock, latch pins; outputs testable as expect what:"active"
   * text:<output pin name>), '165' = parallel-in/serial-out (inputs from toggles, load, clock, serial out). Pin names map
   * the roles: { data, clock, latch, outputs[] } or { load, clock, serialOut, inputs[] }, parallel pins listed A…H
   * (QA…QH on a 595; A…H on a 165, where H is shifted out first). Mark parallel pins required:false. */
  shift?: { type: '595' | '165'; data?: string; clock: string; latch?: string; outputs?: string[]; load?: string; serialOut?: string; inputs?: string[] };
  /** servo: inputPin is the signal; a pulse of minUs…maxUs (at about 50 Hz) turns it to 0…degrees.
   * continuous: a continuous-rotation servo instead. The pulse sets speed and direction: stopped within
   * stopUs ± deadbandUs/2 (and with no pulses), full speed at minUs and maxUs; pulses below stopUs turn it
   * `below` ('cw' or 'ccw', seen from the horn side), above it the other way. degrees is ignored. */
  servo?: { minUs: number; maxUs: number; degrees: number; continuous?: { stopUs: number; deadbandUs: number; below: 'cw' | 'ccw' } };
  /** tft-display: an SPI colour TFT (ST7789/ST7735/ILI9341/ILI9488 command set: 0x2A/0x2B window, 0x2C pixels, 0x3A COLMOD
   * picks 16-bit RGB565 or 18-bit RGB666 = 3 bytes per pixel), or with controller 'ssd1351' the SSD1351 OLED command set
   * (0x15/0x75 window, 0x5C write RAM, 0xA0 remap and colour depth, 0xAF/0xAE on/off).
   * Pins: fn spi.sck, spi.mosi, spi.cs, tft.dc (data/command) and optionally tft.reset. */
  width?: number;
  height?: number;
  /** tft-display: the pixel format at reset before any COLMOD (16 = RGB565, default; 18 = RGB666). */
  pixelBits?: 16 | 18;
  /** addressable-led: how many WS2812-type LEDs are chained; inputPin is DIN. Uses MicroPython's neopixel module.
   * segment-display max7219: how many MAX7219s are daisy-chained DOUT → DIN (e.g. 4 on an FC-16 32×8 matrix module;
   * DIN enters the rightmost one). */
  count?: number;
  /** addressable-led: the LED chip. 'ws2812' (default; GRB, MicroPython neopixel), 'sk6812-rgbw' (GRBW: the code must
   * use NeoPixel(pin, n, bpp=4)), or 'apa102' (APA102/SK9822 on SPI: pins fn spi.sck = CI and spi.mosi = DI, no
   * inputPin; start frame, then 0xE0|brightness, B, G, R per LED). */
  ledProtocol?: 'ws2812' | 'sk6812-rgbw' | 'apa102';
  /** segment-display: TM1637 (pins CLK + DIO, fn digital-out) or MAX7219 (SPI: fn spi.sck, spi.mosi, spi.cs as LOAD);
   * or HT16K33 (I2C LED backpack); digits = how many digit positions the module shows; matrix = an 8×8 dot matrix
   * instead of digits (MAX7219: row = digit register, bit 7 leftmost; HT16K33: Adafruit 8×8 backpack wiring, row y = RAM
   * byte 2y, column x = bit (x + 7) % 8). Matrix text drawn with the 8×8 framebuf font is read back for tests. */
  protocol?: 'tm1637' | 'max7219' | 'ht16k33' | 'tm1638';
  /** segment-display tm1638 (pins named STB, CLK, DIO): digits come from the even RAM bytes by default (digitMap
   * [0, 2, … 14]); leds = single LEDs as {name, addr, bit} (LED&KEY: LED n at RAM byte 2n+1, bit 0) that tests check with
   * what "active" + text name; keys = push buttons as toggles {control, k (1-3), ks (1-8)} at the chip's K/KS
   * matrix position, read back with the 0x42 read-keys command. */
  tm1638?: { leds?: { name: string; addr: number; bit: number }[]; keys?: { control: string; label?: string; k: 1 | 2 | 3; ks: number }[] };
  digits?: number;
  matrix?: boolean;
  /** segment-display: which RAM position drives each digit, left to right (e.g. [2,1,0,5,4,3] on common 6-digit TM1637 modules). */
  digitMap?: number[];
  /** segment-display ht16k33: 14 = 14-segment alphanumeric digits (each digitMap entry is the RAM byte of the digit's low
   * byte, the next byte is its high byte; glyphs as the Adafruit LED Backpack font, bit 14 = DP). Default 7. */
  segments?: 7 | 14;
  /** i2c-device answering at more addresses too: a read there returns the byte at `reg` (e.g. VEML6070's MSB at 0x39,
   * its alert-response address 0x0C). */
  i2cAliases?: { addr: number; reg: string }[];
  /** keypad-matrix: row and column pins and the key labels (keys[row][col]); the "value" slider holds
   * key number n (1 = keys[0][0], counting along each row; 0 = nothing pressed). Each key joins its row and column. */
  rowPins?: string[];
  colPins?: string[];
  keys?: string[][];
  /** uart-device: what the module sends by itself every `everyMs` (binary fields, or NMEA sentences built from
   * the controls "lat", "lon" and optionally "speed" [knots] and "alt" [m]), and replies to commands it receives. */
  uartBaud?: number;
  /** when: a control that must be on for the module to send (an RFID reader only talks while a tag is in the field). */
  uartStream?: { everyMs: number; nmea?: boolean; bytes?: ResponseSegment[]; when?: string };
  uartReplies?: { match: string; bytes: ResponseSegment[] }[];
  /** spi-device: what the chip clocks out on MISO while CS is low. Each reply may require the
   * transaction to start with `match` (hex bytes, '' = any) and starts `at` bytes into it (default: after match). */
  spiReplies?: { match: string; at?: number; bytes: ResponseSegment[] }[];
  /** hx711: the PD_SCK pin (outputPin is DOUT); raw 24-bit reading = round(value × countsPerUnit + offsetCounts). */
  clockPin?: string;
  countsPerUnit?: number;
  offsetCounts?: number;
  /** oled-display: the controller chip and visible rows (SSD1306 128×64 / 128×32, SH1106 1.3" 128×64).
   * tft-display: 'ssd1351' for the SSD1351 colour OLED command set; 'pcd8544' for the Nokia 5110 84×48 mono LCD (pins
   * fn spi.sck, spi.mosi, spi.cs = CE, tft.dc = DC, tft.reset = RST; width/height are fixed at 84×48). */
  controller?: 'ssd1306' | 'sh1106' | 'ssd1351' | 'pcd8544';
  rows?: 32 | 64;
  /** oled-display: 'spi' for 4-wire SPI modules (D0 = fn spi.sck, D1 = fn spi.mosi, CS = fn spi.cs, DC = fn tft.dc,
   * RES = fn tft.reset); DC low = command byte, high = display data. Default 'i2c' (needs i2cAddress). */
  bus?: 'i2c' | 'spi';
  /** char-lcd: the HD44780 panel size and which PCF8574 port bit drives each line (default the common backpack:
   * P0 = RS, P1 = RW, P2 = E, P3 = backlight, P4–P7 = D4–D7; d4 is the bit of D4, D5–D7 follow it). DDRAM rows start at
   * 0x00, 0x40, then cols and 0x40 + cols on 4-row panels (0x14/0x54 on a 20×4). */
  lcd?: { cols: 8 | 16 | 20 | 24 | 40; rows: 1 | 2 | 4; pins?: { rs: number; rw: number; e: number; backlight: number; d4: number } };
  /** onewire-temp: 1-Wire family code (0x28 DS18B20, 0x10 DS18S20, 0x22 DS1822); outputPin is the DQ line. */
  family?: number;
  outputPin?: string;
  inputPin?: string;
  quantity?: string; // "Temperature"
  unit?: string; // "°C"
  min?: number;
  max?: number;
  default?: number;
  /** analog-sensor: output voltage at min / max of the quantity. */
  vAtMin?: number;
  vAtMax?: number;
  /** digital-sensor: output level when active. */
  activeHigh?: boolean;
  /** i2c-device: fixed register contents, e.g. { "0xD0": 96 } (chip id). */
  registers?: Record<string, number>;
  /** i2c-device: where the slider's measured value appears: raw = round((value - offset) / scale). */
  measure?: I2CMeasure;
  /** i2c-device: more measured values, each in its own register(s) and driven by its own control. */
  measures?: I2CMeasure[];
  /** i2c-device that answers commands rather than register reads (Sensirion, Aosong…): after a write
   * starting with `match` (hex bytes, e.g. "24 00"), reads return `bytes` packed MSB-first. */
  responses?: { match: string; bytes: ResponseSegment[] }[];
  /** More sliders besides the main one (e.g. humidity next to temperature), keyed for measures/outputs/tests. */
  controls?: { key: string; quantity: string; unit?: string; min: number; max: number; default?: number }[];
  /** analog-sensor whose output is a waveform rather than a level (microphones, heartbeat/ECG sensors):
   * V(t) = centerV + (value of ampControl × voltsPerUnit / 2) × shape(2π·f·t), with f = freqHz, or the value of
   * freqControl × freqScale (e.g. BPM × 1/60). shape 'sine', or 'pulse' (a short peak once per period). */
  wave?: { ampControl: string; voltsPerUnit: number; centerV: number; freqHz?: number; freqControl?: string; freqScale?: number; shape?: 'sine' | 'pulse' };
  /** analog-sensor with no supply pin whose output comes from outside (a passive divider fed by the measured voltage,
   * a piezo disc): the output is referenced to GND and NOT clamped to any supply, so overvoltage on a pin shows up. */
  selfPowered?: boolean;
  /** analog-sensor with more than one output (e.g. a joystick's X and Y). */
  analogOutputs?: { pin: string; control: string; vAtMin: number; vAtMax: number }[];
  /** On/off outputs driven by toggles (a joystick's button, an encoder's A/B, a gas module's DO). */
  digitalOutputs?: { pin: string; control: string; label?: string; activeHigh?: boolean }[];
  /** actuator with several control inputs (e.g. a motor driver's IN1/IN2); each shows as on/off. */
  inputPins?: string[];
  /** actuator inputs that switch on when pulled LOW (most optocoupler relay boards): each input is pulled up to the
   * module's supply through the opto LED, and counts as on below about 1.5 V. */
  inputsActiveLow?: boolean;
  /** i2c-device: register width in bits. 16 = each register address holds a 16-bit word (INA219, ADS1115, LM75…). */
  regWidth?: 8 | 16;
  /** i2c-device: register address width in bits (16 for e.g. VL53L1X, VL6180X). */
  addrWidth?: 8 | 16;
  /** i2c-device: a real-time clock's seven BCD time registers starting at `reg`, ticking with simulated time
   * (starts 2026-10-21 12:00:00, 24-hour mode; writing them sets the clock). order 'ds1307' = sec, min, hour,
   * weekday, date, month, year (DS1307/DS3231); 'pcf8563' = sec, min, hour, date, weekday, month, year. */
  rtc?: { reg: string; order: 'ds1307' | 'pcf8563' };
  /** i2c-device: PCA9685-style PWM channels: `count` channels of ON_L, ON_H, OFF_L, OFF_H starting at `base`
   * (12-bit counts; bit 4 of ON_H = full on, bit 4 of OFF_H = full off). Each shows as on when its duty is above 0,
   * testable with expect what:"active" text:"CH<n>". */
  pwmChannels?: { base: string; count: number };
  /** i2c-device: ST-style register auto-increment — the top bit of the register address only asks for
   * auto-increment, so 0xA8 means register 0x28. */
  autoIncrementBit7?: boolean;
  /** i2c-device: more chips in the same package at their own addresses (e.g. LSM303AGR accelerometer 0x19 + magnetometer 0x1E),
   * each with its own registers, measures, regWidth and autoIncrementBit7. */
  subDevices?: { i2cAddress: number; registers?: Record<string, number>; measures?: I2CMeasure[]; regWidth?: 8 | 16; autoIncrementBit7?: boolean; responses?: { match: string; bytes: ResponseSegment[] }[]; constants?: Record<string, number | string>; commandLatch?: { reg: string; from: number; to: number }; promCrc4?: { reg: string } }[];
  /** i2c-device: named calibration constants for measure.solve formulas, in order: a number, or a formula (src/core/expr.ts)
   * that may read the chip's own registers with reg(addr) and earlier constants, e.g. "signed(reg(0xA0)*256 + reg(0xA1), 16)".
   * Reading them from the registers keeps them identical to the PROM/OTP values the real driver reads. */
  constants?: Record<string, number | string>;
  /** i2c-device: a write of just one command byte in from…to is also stored in pseudo-register reg (e.g. "0x100"), so
   * measure.when can pick what the next read returns (MS5611: 0x40–0x48 convert D1, 0x50–0x58 convert D2, then
   * command 0x00 reads the 24-bit result from register 0x00). */
  commandLatch?: { reg: string; from: number; to: number };
  /** i2c-device: an MS56xx-style PROM of 8 big-endian 16-bit words in byte registers from reg, whose last word's low
   * nibble is the AN520 CRC-4; the simulator fills that nibble in. */
  promCrc4?: { reg: string };
  /** i2c-device DAC: written codes drive output pins as voltages (pins in channel order, wired as analog outputs).
   * 'mcp4725': fast-mode writes (00 PD1 PD0 D11–D8, D7–D0) and write-DAC(-and-EEPROM) commands (010/011…, D11–D4,
   * D3–D0 xxxx); Vout = VDD × code / 4096; reads return the 5-byte status/DAC/EEPROM block.
   * 'mcp4728': fast write (channels A–D in turn), multi-write (0x40 | ch<<1 | UDAC), sequential (0x50…) and single
   * (0x58…) writes, VREF (0x8x), gain (0xCx) and power-down (0xAx) selects; Vout = VDD × code/4096 with VREF = 0,
   * or 2.048 V × gain × code/4096 (at most VDD) with the internal reference. LDAC is taken as tied low, so UDAC = 1
   * leaves the output unchanged until the next update of that channel. Power-down modes drive the output to 0 V. */
  dac?: { protocol: 'mcp4725' | 'mcp4728'; pins: string[] };
  /** rfid-reader: the reader chip and its VersionReg (0x37) value (0x91 = v1.0, 0x92 = v2.0; many clones read 0x88 or 0x12).
   * Modelled: registers, 64-byte FIFO, CRC coprocessor (CRC_A), Transceive with short frames and the timer timeout, TxCRCEn/
   * RxCRCEn, and one MIFARE Classic 1K card (ATQA 04 00, SAK 08) through REQA/WUPA, anticollision, SELECT and HLTA.
   * Not modelled: Crypto1 authentication (MFAuthent ends with a protocol error, so sector reads fail as on an
   * unauthenticated card), 7-byte UIDs, several cards at once. */
  rfid?: { chip: 'mfrc522'; version?: number };
  /** ir-receiver: the remote's protocol. 'nec': 9 ms mark, 4.5 ms space, then address, ~address, command, ~command, LSB
   * first (562.5 µs mark; 562.5 µs space = 0, 1687.5 µs = 1), a final mark, and a repeat code (9 ms, 2.25 ms, mark) every
   * 108 ms while held. 'nec-ext': the same with a 16-bit address in place of address and ~address. The output idles
   * high and goes low during each mark (demodulated, active low). */
  ir?: { protocol: 'nec' | 'nec-ext' };
  /** i2c-device with a sample FIFO (MAX30102/MAX30105-style pulse oximeters): see FifoSpec. */
  fifo?: FifoSpec;
  /** i2c-device: register bits that clear themselves after a write (a soft-reset bit the driver polls until it reads 0).
   * reset: the write also restores every register to its power-on value (sim.registers) and empties the FIFO. */
  selfClearing?: { reg: string; mask: number; reset?: boolean }[];
  /** i2c-device with no register pointer (PCF8574-style): every write sets register 0x00, every read returns it. */
  pointerless?: boolean;
  /** pointerless i2c-device with a 16-bit port (PCF8575): every transfer is byte pairs, port 0 (register 0x00, P00–P07)
   * then port 1 (register 0x01, P10–P17); a write takes effect per complete pair, a read streams port 0, port 1, port 0… */
  pointerlessBytes?: 1 | 2;
  /** i2c-device with no register pointer (TLV493D): every read starts at register 0, and written bytes go to a separate
   * write-register map that reads never see. */
  readFromZero?: boolean;
  /** i2c-device: register bits that are output pins (e.g. an expander's P0…P7), shown as on/off and testable
   * with expect what:"active" text:<name>. */
  outputBits?: { reg: string; bit: number; name: string }[];
  /** i2c-device: register bits that read input pins, driven by toggles (control key). activeLow: pressed reads 0. */
  inputBits?: { reg: string; bit: number; control: string; label?: string; activeLow?: boolean }[];
}

/** A sample FIFO filled at the chip's configured sample rate (MAX3010x). Each sample holds one value per active channel,
 * sent as `bytes` big-endian bytes per channel (left-justified `resolution` bits within sampleBits, the rest 0). The
 * FIFO_DATA register (`data`) does not auto-increment: every `bytes × channels` bytes read pop one sample and advance
 * the read pointer. writePtr / readPtr / overflow are ordinary registers the driver may also write (to clear the FIFO).
 * Full FIFO: with `rollover` on, the oldest sample is overwritten (read pointer moves on); off, new samples are dropped;
 * either way the overflow counter counts lost samples (saturating at depth − 1).
 * Channel values follow a pulse: value(t) = control × (1 − depth × ppg(bpm × t / 60)), where ppg is a beat shape peaking
 * once per period (blood volume rises, so less light is reflected); depth is a number or a control key (fraction 0–1). */
export interface FifoSpec {
  data: string;
  writePtr: string;
  readPtr: string;
  overflow: string;
  depth: number;
  /** Bytes per channel per sample (3) and the bit width the value is clamped to (18). */
  bytes: number;
  sampleBits: number;
  /** Channel order in each sample (e.g. red, then IR), each the control giving its light level in ADC counts. */
  channels: { control: string; depth?: number | string }[];
  /** The heart rate control (beats per minute) that paces the pulse. */
  bpmControl: string;
  /** How many channels each mode value turns on: mode = (reg & mask) >> shift, e.g. { "2": 1, "3": 2, "7": 3 }; any other
   * mode (or the shutdown bit set) produces no samples. */
  mode: { reg: string; mask: number; shift?: number; channels: Record<string, number>; shutdownBit?: number };
  /** Sample rate in Hz per field value (e.g. SPO2_CONFIG bits 4:2 → 50, 100 … 3200). */
  rate: { reg: string; mask: number; shift?: number; hz: number[] };
  /** Samples averaged per FIFO entry, per field value (FIFO_CONFIG bits 7:5 → 1, 2, 4 … 32). */
  average?: { reg: string; mask: number; shift?: number; n: number[] };
  /** ADC resolution in bits per field value (LED pulse width → 15–18 bits, left-justified in sampleBits). */
  resolution?: { reg: string; mask: number; shift?: number; bits: number[] };
  rollover?: { reg: string; bit: number };
  /** Interrupt status register, cleared when read: readyBit set on each new sample, almostFullBit when the unread
   * count reaches depth − (almostFullSlots field), e.g. MAX30102 FIFO_A_FULL[3:0] in FIFO_CONFIG. */
  status?: { reg: string; readyBit?: number; almostFullBit?: number; almostFullSlots?: { reg: string; mask: number } };
}

export interface I2CMeasure {
  reg: string;
  /** Bytes from reg (ignored with fields). */
  bytes: number;
  scale: number;
  offset?: number;
  signed?: boolean;
  littleEndian?: boolean;
  shift?: number;
  /** Which control supplies the value ('value' = the main slider). */
  control?: string;
  /** Exponent + mantissa encodings that auto-range like the chip (scale = LSB at exponent 0):
   * 'max44009' — reg = E3..E0 M7..M4, reg+1 = 0000 M3..M0, value = 2^E × M × scale;
   * 'opt3001' — 16-bit word E3..E0 R11..R0, value = 2^E × R × scale.
   * 'ens210' — 3 bytes (bytes: 3): the 16-bit value (value − offset) / scale low byte first, then VALID = 1 in bit 0 and the
   * CRC-7 (poly 0x89, init 0x7F) of those 17 bits in bits 7:1, as the ENS210's T_VAL/H_VAL. */
  format?: 'max44009' | 'opt3001' | 'ens210';
  /** Values whose bits are spread over several registers (e.g. TLV493D: Bx[11:4] in 0x00, Bx[3:0] in bits 7:4 of 0x04).
   * The raw value round((value − offset) / scale), `bits` wide (two's complement if signed), is split into slices: raw bits
   * from…from+width−1 go to bits at…at+width−1 of byte register reg; the register's other bits keep their value. */
  bits?: number;
  fields?: { reg: string; from: number; width: number; at?: number }[];
  /** Only while the last value written to this register matches (e.g. BMP180: 0xF4 = 0x2E → temperature in 0xF6). */
  when?: { reg: string; equals: number; mask?: number };
  /** Calibrated sensors (MS5611, QMP6988…): instead of (value − offset) / scale, the raw counts are found by inverting
   * the datasheet's forward formula. `formula` (src/core/expr.ts: + − * / ^, if(), floor(), signed(), name = …; steps)
   * computes the physical value in the control's units from this measure's raw counts (named `raw`), sim.constants and
   * the raws of earlier solve measures; the simulator picks the integer in min…max whose result is closest to the
   * slider. The formula must rise or fall steadily over that range. The raw is then encoded as usual (bytes, signed…;
   * scale is ignored). */
  solve?: { raw: string; formula: string; min: number; max: number };
}

/** One field of a command response, packed MSB-first into the reply's bit stream. */
/** Bits a reply occupies (checksums are 8 bits except sum16). */
export function segBits(segs: ResponseSegment[]): number {
  return segs.reduce((n, b) => n + ('crc' in b ? (['sum16', 'neg16', 'modbus16', 'xor8hex'].includes(b.crc) ? 16 : 8) : b.bits), 0);
}

export type ResponseSegment =
  | { const: number; bits: number }
  /** littleEndian: a whole-byte field sent low byte first (SDS011, many UART frames). */
  | { control: string; bits: number; scale: number; offset?: number; signed?: boolean; littleEndian?: boolean; hex?: boolean }
  /* hex: the value sent as uppercase ASCII hex digits, bits/8 characters of 4 bits each (RDM6300 tag frames). */
  /** An IEEE-754 single-precision float of (value − offset) / scale, big-endian: the whole float (bits 32), or its
   * high or low 16-bit half (bits 16) when the chip puts a CRC after every word (SCD30, SPS30). */
  | { control: string; float32: true | 'hi' | 'lo'; bits: 32 | 16; scale?: number; offset?: number }
  /** A decimal reading sent as whole units and tenths in separate bytes (DHT12: 56.8 %RH → 56, 8): 'int' is the whole
   * part of |value|, 'tenths' its first decimal; signBit sets that bit when the value is negative (DHT12 temperature tenths, bit 7). */
  | { control: string; split: 'int' | 'tenths'; bits: number; signBit?: number }
  /** CRC-8 over the previous `over` bytes, poly 0x31: 'sensirion' starts at 0xFF (SHT3x/4x, SCD4x, AHT20), 'htu21d' at 0x00 (HTU21D, Si7021). */
  | { crc: 'sensirion' | 'htu21d'; over: number }
  /** Checksums of serial sensors over the previous `over` bytes: 'sum16' = 16-bit sum, big-endian (PMS5003);
   * 'mhz19' = 0xFF − (sum of bytes after the first) + 1 (MH-Z19, SDS011-style); 'neg16' = −sum as 16 bits, big-endian (DFPlayer); 'modbus16' = CRC-16/MODBUS, low byte first (Senseair S8, Modbus sensors). */
  | { crc: 'sum16' | 'mhz19' | 'sum8' | 'neg16' | 'modbus16'; over: number }
  /** 'neg8' = 256 − (sum of ALL the previous `over` bytes, header included) mod 256, one byte (Cubic CM1106). */
  | { crc: 'neg8'; over: number }
  /** XOR of the bytes spelled by the previous `over` ASCII hex characters, sent as 2 ASCII hex characters (RDM6300). */
  | { crc: 'xor8hex'; over: number };

export interface CustomPartSpec {
  type: string; // "custom-bme280"
  name: string;
  mpn: string;
  category: PartDef['category'];
  description: string;
  eli5: string;
  refPrefix: string;
  interface: CustomInterface;
  pins: PinDef[];
  vmin?: number;
  vmax?: number;
  currentMa?: number;
  i2cAddress?: number;
  datasheetUrl?: string;
  priceUsd: number;
  supplierQuery: string;
  footprint?: string;
  buildNotes?: string[];
  keywords?: string[];
  sim: CustomSim;
  /** The board has connectors on more than one edge (e.g. a signal header and a screw terminal): it is wired
   * with jumper leads (off the breadboard, a cable connector on the circuit board) rather than plugged in. */
  cabled?: boolean;
  /** MicroPython driver written from the datasheet, copied into projects that use the part. */
  driver?: { filename: string; code: string };
  /** The part's skill (markdown) — given to the AI whenever the part is in a project. */
  skill?: string;
  /**
   * A tiny program that uses the part, and a test for it. The part check wires the part to a board
   * the way autoWirePart does, runs this in the simulator and runs the test. `{PIN}` placeholders
   * (e.g. {OUT}) are replaced with the GPIO number the part's pin was wired to.
   */
  example?: { code: string; test: import('./acceptance').AcceptanceTest };
}

const REGISTRY = new Map<string, { spec: CustomPartSpec; def: PartDef }>();

export function specToDef(spec: CustomPartSpec): PartDef {
  const controls: SimControl[] = [];
  const s = spec.sim;
  if (s.kind === 'pulse-sensor' || s.kind === 'ultrasonic' || s.kind === 'resistive-sensor' || s.kind === 'analog-sensor' || s.kind === 'onewire-temp' || s.kind === 'dht-sensor' || s.kind === 'hx711' || s.kind === 'spi-device' || s.kind === 'uart-device' || (s.kind === 'i2c-device' && (s.measure || s.measures?.length || s.responses?.length || s.fifo))) {
    const min = s.min ?? 0;
    const max = s.max ?? 100;
    controls.push({ key: 'value', label: s.quantity ?? 'Value', kind: 'slider', min, max, step: (max - min) / 200 >= 1 ? 1 : +((max - min) / 200).toPrecision(1), default: s.default ?? (min + max) / 2, unit: s.unit ? ` ${s.unit}`.replace(/^ (°|%)/, '$1') : '' });
  }
  if (s.kind === 'digital-sensor') controls.push({ key: 'active', label: s.quantity ?? 'Triggered', kind: 'toggle', default: 0 });
  if (s.kind === 'rfid-reader')
    controls.push({ key: 'present', label: 'Card on the reader', kind: 'toggle', default: 0 }, { key: 'value', label: 'Card UID (4 bytes)', kind: 'slider', min: 0, max: 0xffffffff, step: 1, default: s.default ?? 0xa1b2c3d4, unit: '' });
  if (s.kind === 'ir-receiver')
    controls.push({ key: 'press', label: 'Remote button held', kind: 'toggle', default: 0 }, { key: 'value', label: 'Button code', kind: 'slider', min: 0, max: 255, step: 1, default: s.default ?? 0x45, unit: '' }, { key: 'address', label: 'Remote address', kind: 'slider', min: 0, max: s.ir?.protocol === 'nec-ext' ? 0xffff : 255, step: 1, default: 0, unit: '' });
  if (s.kind === 'keypad-matrix') controls.push({ key: 'value', label: `Key held (1–${(s.keys ?? []).flat().length}: ${(s.keys ?? []).flat().join(' ')}; 0 = none)`, kind: 'slider', min: 0, max: (s.keys ?? []).flat().length, step: 1, default: 0 });
  for (const d of s.digitalOutputs ?? []) if (!controls.some((x) => x.key === d.control)) controls.push({ key: d.control, label: d.label ?? d.pin, kind: 'toggle', default: 0 });
  if (s.kind === 'shift-register' && s.shift?.type === '165') for (const p of s.shift.inputs ?? []) controls.push({ key: p, label: `Input ${p}`, kind: 'toggle', default: 0 });
  for (const d of s.inputBits ?? []) if (!controls.some((x) => x.key === d.control)) controls.push({ key: d.control, label: d.label ?? d.control, kind: 'toggle', default: 0 });
  for (const k of s.tm1638?.keys ?? []) if (!controls.some((x) => x.key === k.control)) controls.push({ key: k.control, label: k.label ?? k.control, kind: 'toggle', default: 0 });
  for (const c of s.controls ?? []) {
    if (c.key === 'value' || controls.some((x) => x.key === c.key)) continue;
    controls.push({ key: c.key, label: c.quantity, kind: 'slider', min: c.min, max: c.max, step: (c.max - c.min) / 200 >= 1 ? 1 : +((c.max - c.min) / 200).toPrecision(1), default: c.default ?? (c.min + c.max) / 2, unit: c.unit ? ` ${c.unit}`.replace(/^ (°|%)/, '$1') : '' });
  }
  return {
    type: spec.type,
    name: spec.name,
    category: spec.category,
    description: spec.description,
    eli5: spec.eli5,
    refPrefix: spec.refPrefix || 'U',
    pins: spec.pins,
    controls,
    vmin: spec.vmin,
    vmax: spec.vmax,
    currentMa: spec.currentMa,
    i2cAddress: spec.i2cAddress,
    bom: { mpn: spec.mpn, description: spec.description.split('. ')[0], priceUsd: spec.priceUsd, supplierQuery: spec.supplierQuery, footprint: spec.footprint },
    kicad: { symbol: `Sparkbench:${spec.type}`, footprint: spec.footprint ?? `Connector_PinHeader_2.54mm:PinHeader_1x${String(spec.pins.length).padStart(2, '0')}_P2.54mm_Vertical`, value: () => spec.mpn },
    keywords: spec.keywords ?? [spec.mpn.toLowerCase(), spec.name.toLowerCase()],
    buildNotes: spec.buildNotes,
  };
}

export function registerCustomPart(spec: CustomPartSpec) {
  REGISTRY.set(spec.type, { spec, def: specToDef(spec) });
}

export function registerProjectParts(project: Pick<Project, 'customParts'> | null | undefined) {
  for (const s of project?.customParts ?? []) registerCustomPart(s);
}

export function customDef(type: string): PartDef | undefined {
  return REGISTRY.get(type)?.def;
}

export function customSpec(type: string): CustomPartSpec | undefined {
  return REGISTRY.get(type)?.spec;
}

export function allCustomDefs(): PartDef[] {
  return [...REGISTRY.values()].map((x) => x.def);
}

export function slugType(mpn: string): string {
  return `custom-${mpn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** Sanity-check AI-extracted specs before they enter a design. */
export function validateSpec(spec: CustomPartSpec): string[] {
  const errs: string[] = [];
  if (!/^custom-[a-z0-9-]+$/.test(spec.type)) errs.push('type must look like custom-<mpn>');
  if (!spec.pins?.length) errs.push('no pins');
  const names = new Set<string>();
  for (const p of spec.pins ?? []) {
    if (!p.name || names.has(p.name)) errs.push(`bad or duplicate pin name "${p.name}"`);
    names.add(p.name);
  }
  if (!spec.pins?.some((p) => p.role === 'gnd') && spec.interface !== 'passive') errs.push('no ground pin');
  if (spec.sim?.selfPowered && (spec.sim.kind !== 'analog-sensor' || spec.sim.vAtMin === undefined || spec.sim.vAtMax === undefined)) errs.push('selfPowered is only for an analog-sensor with vAtMin and vAtMax');
  const s = spec.sim;
  const keys = new Set(['value', 'active', ...(s.controls ?? []).map((c) => c.key), ...(s.digitalOutputs ?? []).map((d) => d.control), ...(s.inputBits ?? []).map((d) => d.control)]);
  if (s.outputPin && !names.has(s.outputPin)) errs.push(`sim.outputPin ${s.outputPin} is not a pin`);
  if (s.inputPin && !names.has(s.inputPin)) errs.push(`sim.inputPin ${s.inputPin} is not a pin`);
  if (s.kind === 'i2c-device' && spec.i2cAddress === undefined) errs.push('i2c-device without i2cAddress');
  if (s.kind === 'tft-display') {
    if (!(['spi.sck', 'spi.mosi', 'tft.dc'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('a TFT needs pins with fn spi.sck, spi.mosi and tft.dc (plus spi.cs unless the board ties CS low)');
    if (!s.width || !s.height || s.width > 480 || s.height > 480) errs.push('a TFT needs width and height (up to 480)');
    if (s.controller && s.controller !== 'ssd1351' && s.controller !== 'pcd8544') errs.push(`controller ${s.controller} is an oled-display controller; a tft-display takes 'ssd1351', 'pcd8544' or nothing (MIPI DCS)`);
    if (s.controller === 'pcd8544' && ((s.width ?? 84) !== 84 || (s.height ?? 48) !== 48)) errs.push('a PCD8544 panel is 84×48');
    if (s.controller === 'pcd8544' && s.pixelBits !== undefined) errs.push('pixelBits is for colour panels, not the PCD8544');
    if (s.controller === 'ssd1351' && (s.width! > 128 || s.height! > 128)) errs.push('an SSD1351 drives at most 128×128');
  }
  if (s.pixelBits !== undefined && (s.kind !== 'tft-display' || ![16, 18].includes(s.pixelBits))) errs.push('pixelBits (16 or 18) is for tft-display');
  if (s.kind === 'oled-display' && s.controller === 'ssd1351') errs.push("controller 'ssd1351' is a colour OLED: use kind tft-display");
  if (s.kind === 'oled-display' && s.controller === 'pcd8544') errs.push("controller 'pcd8544' (Nokia 5110 LCD) uses kind tft-display");
  if (s.ledProtocol && !['ws2812', 'sk6812-rgbw', 'apa102'].includes(s.ledProtocol)) errs.push(`ledProtocol ${s.ledProtocol} must be ws2812, sk6812-rgbw or apa102`);
  if (s.ledProtocol && s.kind !== 'addressable-led') errs.push('ledProtocol is for addressable-led');
  if (s.kind === 'i2s-amp' && !(['i2s.bclk', 'i2s.lrc', 'i2s.din'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('an I2S amplifier needs pins with fn i2s.bclk, i2s.lrc and i2s.din');
  if (s.i2sAmp && s.kind !== 'i2s-amp') errs.push('i2sAmp is for i2s-amp');
  if (s.i2sAmp?.sdPin && !names.has(s.i2sAmp.sdPin)) errs.push(`i2sAmp.sdPin ${s.i2sAmp.sdPin} is not a pin`);
  if (s.i2sAmp?.sdPullUpOhms !== undefined && !(s.i2sAmp.sdPullUpOhms > 0 && s.i2sAmp.sdPin)) errs.push('i2sAmp.sdPullUpOhms needs sdPin and a positive value');
  if (s.kind === 'addressable-led' && (!s.count || s.count < 1 || s.count > 1024)) errs.push('addressable-led needs a count of 1-1024');
  if (s.kind === 'addressable-led' && s.ledProtocol !== 'apa102' && !s.inputPin) errs.push('addressable-led needs inputPin (DIN)');
  if (s.kind === 'addressable-led' && s.ledProtocol === 'apa102' && !(['spi.sck', 'spi.mosi'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('an APA102 strip needs pins with fn spi.sck (CI) and spi.mosi (DI)');
  if (s.kind === 'dht-sensor' && (!s.outputPin || !keys.has('humidity'))) errs.push('dht-sensor needs outputPin (DATA) and a "humidity" control');
  if (s.pointerlessBytes !== undefined && (!s.pointerless || ![1, 2].includes(s.pointerlessBytes))) errs.push('pointerlessBytes (1 or 2) needs pointerless: true');
  if (s.kind === 'servo' && (!s.inputPin || !s.servo || s.servo.maxUs <= s.servo.minUs)) errs.push('servo needs inputPin and servo {minUs, maxUs, degrees}');
  const cont = s.servo?.continuous;
  if (cont && !(cont.stopUs > s.servo!.minUs && cont.stopUs < s.servo!.maxUs && cont.deadbandUs >= 0 && cont.deadbandUs / 2 < Math.min(cont.stopUs - s.servo!.minUs, s.servo!.maxUs - cont.stopUs) && (cont.below === 'cw' || cont.below === 'ccw')))
    errs.push('servo.continuous needs minUs < stopUs < maxUs, a deadband narrower than either side, and below "cw" or "ccw"');
  if (s.kind === 'shift-register') {
    const sh = s.shift;
    if (!sh) errs.push('shift-register needs shift');
    else {
      const need = sh.type === '595' ? [sh.data, sh.clock, sh.latch, ...(sh.outputs ?? [])] : [sh.load, sh.clock, sh.serialOut, ...(sh.inputs ?? [])];
      for (const n of need) if (!n || !names.has(n)) errs.push(`shift-register pin ${n} is not a pin`);
      if (!(sh.type === '595' ? sh.outputs : sh.inputs)?.length) errs.push('shift-register needs its parallel pins');
    }
  }
  if (s.kind === 'onewire-temp' && !s.outputPin) errs.push('onewire-temp needs outputPin (the DQ line)');
  for (const p of spec.pins) {
    if (!p.supply) continue;
    if (p.role !== 'power') errs.push(`supply on ${p.name}: only a power pin can take an external supply`);
    if (!(p.supply.vmin > 0 && p.supply.vmax >= p.supply.vmin && p.supply.vmax <= 60)) errs.push(`supply on ${p.name} needs 0 < vmin ≤ vmax ≤ 60 V`);
    if (p.supply.currentMa !== undefined && !(p.supply.currentMa > 0 && p.supply.currentMa <= 20000)) errs.push(`supply.currentMa on ${p.name} must be 0–20000 mA`);
  }
  for (const p of spec.pins) if (p.pullUp !== undefined && !(p.pullUp >= 100 && p.pullUp <= 100000)) errs.push(`pull-up on ${p.name} must be 100 Ω – 100 kΩ`);
  if (s.kind === 'oled-display' && s.bus !== 'spi' && spec.i2cAddress === undefined) errs.push('oled-display needs i2cAddress (or bus: "spi")');
  if (s.kind === 'oled-display' && s.bus === 'spi' && !(['spi.sck', 'spi.mosi', 'tft.dc'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('an SPI OLED needs pins with fn spi.sck (D0), spi.mosi (D1) and tft.dc (DC), plus spi.cs and tft.reset if the module has them');
  if (s.bus !== undefined && s.kind !== 'oled-display') errs.push('bus is for oled-display');
  if (s.kind === 'char-lcd') {
    if (spec.i2cAddress === undefined) errs.push('char-lcd needs i2cAddress (its backpack, e.g. 0x27)');
    if (!s.lcd || ![8, 16, 20, 24, 40].includes(s.lcd.cols) || ![1, 2, 4].includes(s.lcd.rows)) errs.push('char-lcd needs lcd: { cols: 16 or 20 (8/24/40), rows: 1, 2 or 4 }');
    const lp = s.lcd?.pins;
    if (lp && ([lp.rs, lp.rw, lp.e, lp.backlight, lp.d4].some((b) => !Number.isInteger(b) || b < 0 || b > 7) || lp.d4 > 4 || new Set([lp.rs, lp.rw, lp.e, lp.backlight, lp.d4, lp.d4 + 1, lp.d4 + 2, lp.d4 + 3]).size !== 8)) errs.push('lcd.pins must give each line its own port bit 0–7, with D4–D7 on four consecutive bits from d4');
  }
  if (s.lcd && s.kind !== 'char-lcd') errs.push('lcd is for char-lcd');
  if (s.readFromZero && (s.kind !== 'i2c-device' || s.pointerless || s.regWidth === 16)) errs.push('readFromZero is for byte-register i2c-devices (not pointerless or 16-bit)');
  if (s.kind === 'spi-device') {
    if (!spec.pins.some((p) => p.fn === 'spi.sck') || !spec.pins.some((p) => p.fn === 'spi.miso') || !spec.pins.some((p) => p.fn === 'spi.cs')) errs.push('spi-device needs pins with fn spi.sck, spi.miso and spi.cs');
    if (!s.spiReplies?.length) errs.push('spi-device needs spiReplies');
    for (const r of s.spiReplies ?? []) {
      if (r.match && !/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`spi reply match "${r.match}" must be hex bytes like "01" or ""`);
      const bits = segBits(r.bytes);
      if (bits % 8) errs.push(`spi reply "${r.match}" is ${bits} bits, not whole bytes`);
      for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`spi reply field control ${b.control} is not a control`);
    }
  }
  if (s.kind === 'uart-device') {
    if (!spec.pins.some((p) => p.fn === 'uart.tx')) errs.push('uart-device needs its TX pin marked fn uart.tx');
    if (!s.uartStream && !s.uartReplies?.length) errs.push('uart-device needs uartStream or uartReplies');
    if (s.uartStream?.nmea && !(keys.has('lat') && keys.has('lon'))) errs.push('an NMEA stream needs controls "lat" and "lon"');
    if (s.uartStream?.when && !keys.has(s.uartStream.when)) errs.push(`uartStream.when ${s.uartStream.when} is not a control`);
    for (const r of [...(s.uartReplies ?? []), ...(s.uartStream?.bytes ? [{ match: '', bytes: s.uartStream.bytes }] : [])]) {
      if (r.match && !/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`uart reply match "${r.match}" must be hex bytes`);
      if (segBits(r.bytes) % 8) errs.push(`uart reply "${r.match}" is not whole bytes`);
      for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`uart field control ${b.control} is not a control`);
    }
  }
  if (s.kind === 'keypad-matrix') {
    if (!s.rowPins?.length || !s.colPins?.length || !s.keys?.length) errs.push('keypad-matrix needs rowPins, colPins and keys');
    for (const p of [...(s.rowPins ?? []), ...(s.colPins ?? [])]) if (!names.has(p)) errs.push(`keypad pin ${p} is not a pin`);
    if (s.keys && (s.keys.length !== s.rowPins?.length || s.keys.some((r) => r.length !== s.colPins?.length))) errs.push('keys must be rows × columns');
  }
  if (s.kind === 'segment-display') {
    if (s.protocol === 'tm1637' && !(names.has('CLK') && names.has('DIO'))) errs.push('a TM1637 display needs pins named CLK and DIO');
    if (s.protocol === 'max7219' && !(['spi.sck', 'spi.mosi', 'spi.cs'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('a MAX7219 display needs pins with fn spi.sck, spi.mosi and spi.cs');
    if (s.protocol === 'ht16k33' && (spec.i2cAddress === undefined || (!s.matrix && !s.digitMap?.length))) errs.push('an HT16K33 display needs i2cAddress and digitMap (the RAM byte of each digit, e.g. [0,2,6,8]), or matrix: true');
    if (s.segments !== undefined && (s.protocol !== 'ht16k33' || ![7, 14].includes(s.segments) || s.matrix)) errs.push('segments (7 or 14) is for HT16K33 digit displays');
    if (s.protocol === 'max7219' && s.count !== undefined && !(Number.isInteger(s.count) && s.count >= 1 && s.count <= 8)) errs.push('count (daisy-chained MAX7219s) must be 1-8');
    if (s.protocol === 'max7219' && (s.count ?? 1) > 1 && !s.matrix) errs.push('daisy-chained MAX7219s (count > 1) are modelled as a dot matrix: set matrix: true');
    if (s.protocol === 'tm1638' && !(names.has('STB') && names.has('CLK') && names.has('DIO'))) errs.push('a TM1638 module needs pins named STB, CLK and DIO');
    for (const k of s.tm1638?.keys ?? []) if (![1, 2, 3].includes(k.k) || !(Number.isInteger(k.ks) && k.ks >= 1 && k.ks <= 8)) errs.push(`TM1638 key ${k.control}: k must be 1-3 and ks 1-8`);
    for (const l of s.tm1638?.leds ?? []) if (!(l.addr >= 0 && l.addr <= 15 && l.bit >= 0 && l.bit <= 7)) errs.push(`TM1638 LED ${l.name}: addr 0-15, bit 0-7`);
    if (s.tm1638 && s.protocol !== 'tm1638') errs.push('tm1638 settings need protocol tm1638');
    if (!s.protocol) errs.push('segment-display needs protocol tm1637, max7219, ht16k33 or tm1638');
  }
  if (s.kind === 'hx711' && (!s.outputPin || !s.clockPin || !names.has(s.clockPin) || !s.countsPerUnit)) errs.push('hx711 needs outputPin (DOUT), clockPin (PD_SCK) and countsPerUnit');
  if (s.kind === 'onewire-temp' && s.family !== undefined && ![0x10, 0x22, 0x28, 0x3b, 0x42].includes(s.family)) errs.push(`1-Wire family 0x${s.family.toString(16)} is not a DS18x20-type thermometer`);
  for (const m of [...(s.measures ?? []), ...(s.measure ? [s.measure] : [])]) {
    if (!/^0x[0-9a-f]{1,2}$/i.test(m.reg)) errs.push(`measure reg ${m.reg} must be hex like 0x1A`);
    if (m.control && !keys.has(m.control)) errs.push(`measure control ${m.control} is not a control`);
    if ((!m.fields && !(m.bytes >= 1 && m.bytes <= 4)) || !m.scale) errs.push(`measure at ${m.reg} needs 1-4 bytes and a non-zero scale`);
    if (m.format === 'ens210' && m.bytes !== 3) errs.push(`measure at ${m.reg}: format ens210 is 3 bytes`);
    if (m.fields) {
      if (!(Number.isInteger(m.bits) && m.bits! >= 1 && m.bits! <= 32)) errs.push(`measure at ${m.reg}: fields need bits (the raw value's width, 1-32)`);
      if (m.format || s.regWidth === 16) errs.push(`measure at ${m.reg}: fields work on plain byte registers only`);
      for (const f of m.fields) {
        const at = f.at ?? 0;
        if (!/^0x[0-9a-f]{1,2}$/i.test(f.reg)) errs.push(`measure field reg ${f.reg} must be hex like 0x04`);
        if (!(f.width >= 1 && at >= 0 && at + f.width <= 8 && f.from >= 0 && f.from + f.width <= (m.bits ?? 0))) errs.push(`measure field at ${f.reg}: bits ${f.from}+${f.width} must lie inside the value and bits ${at}+${f.width} inside one byte`);
      }
    } else if (m.bits !== undefined) errs.push(`measure at ${m.reg}: bits is only used with fields`);
  }
  for (const d of s.subDevices ?? []) for (const m of d.measures ?? []) if (m.control && !keys.has(m.control)) errs.push(`sub-device measure control ${m.control} is not a control`);
  // Calibrated (solve) measures, on the main chip and each sub-device, read their constants from that chip's registers.
  const range = (key: string) => {
    if (key === 'value') return s.min !== undefined && s.max !== undefined ? { min: s.min, max: s.max, def: s.default ?? (s.min + s.max) / 2 } : undefined;
    const c = s.controls?.find((x) => x.key === key);
    return c ? { min: c.min, max: c.max, def: c.default ?? (c.min + c.max) / 2 } : undefined;
  };
  const chips = [
    { name: 'sim', registers: s.registers, regWidth: s.regWidth, constants: s.constants, measures: [...(s.measure ? [s.measure] : []), ...(s.measures ?? [])], latch: s.commandLatch, prom: s.promCrc4 },
    ...(s.subDevices ?? []).map((d) => ({ name: `sub-device 0x${d.i2cAddress.toString(16)}`, registers: d.registers, regWidth: d.regWidth, constants: d.constants, measures: d.measures ?? [], latch: d.commandLatch, prom: d.promCrc4 })),
  ];
  for (const c of chips) {
    const usesSolve = c.measures.some((m) => m.solve);
    if (c.constants && !usesSolve) errs.push(`${c.name}: constants are only used by measure.solve formulas`);
    if (c.prom && (c.regWidth === 16 || !/^0x[0-9a-f]{1,2}$/i.test(c.prom.reg))) errs.push(`${c.name}: promCrc4 needs a byte-register address like 0xA0`);
    if (c.latch && (!/^0x[0-9a-f]{1,3}$/i.test(c.latch.reg) || !(c.latch.from >= 0 && c.latch.to <= 0xff && c.latch.from <= c.latch.to))) errs.push(`${c.name}: commandLatch needs reg (hex) and 0 ≤ from ≤ to ≤ 0xFF`);
    if (!usesSolve) continue;
    if (c.regWidth === 16) errs.push(`${c.name}: solve measures need byte registers`);
    const regs = withPromCrc(c.registers ?? {}, c.prom);
    errs.push(...checkSolve(c.constants, c.measures, (a) => regs[a] ?? 0, range).map((e) => `${c.name}: ${e}`));
  }
  if (s.dac) {
    if (s.kind !== 'i2c-device') errs.push('dac is for i2c-device');
    if (!['mcp4725', 'mcp4728'].includes(s.dac.protocol)) errs.push("dac.protocol must be 'mcp4725' or 'mcp4728'");
    const want = s.dac.protocol === 'mcp4728' ? 4 : 1;
    if (s.dac.pins?.length !== want) errs.push(`dac ${s.dac.protocol} drives ${want} pin${want > 1 ? 's' : ''} (in channel order)`);
    for (const p of s.dac.pins ?? []) if (!names.has(p)) errs.push(`dac pin ${p} is not a pin`);
  }
  if (s.kind === 'rfid-reader') {
    if (s.rfid?.chip !== 'mfrc522') errs.push("rfid-reader needs rfid.chip 'mfrc522'");
    if (!(['spi.sck', 'spi.mosi', 'spi.miso', 'spi.cs'] as const).every((f) => spec.pins.some((p) => p.fn === f))) errs.push('an RFID reader needs pins with fn spi.sck, spi.mosi, spi.miso and spi.cs (SDA/NSS)');
    if (s.rfid?.version !== undefined && !(s.rfid.version >= 0 && s.rfid.version <= 0xff)) errs.push('rfid.version is the VersionReg byte');
  }
  if (s.kind === 'pulse-sensor') {
    if (!s.outputPin || !names.has(s.outputPin)) errs.push('pulse-sensor needs outputPin (the pulse output)');
    const p = s.pulse;
    if (!p || !(p.hzPerUnit > 0)) errs.push('pulse-sensor needs pulse.hzPerUnit > 0');
    if (p?.duty !== undefined && !(p.duty > 0 && p.duty < 1)) errs.push('pulse.duty is a fraction between 0 and 1');
    if (p?.maxHz !== undefined && !(p.maxHz > 0 && p.maxHz <= 5000)) errs.push('pulse.maxHz must be 1–5000 Hz');
  }
  if (s.kind === 'ultrasonic') {
    const e = s.echo;
    if (!s.outputPin || !names.has(s.outputPin)) errs.push('ultrasonic needs outputPin (ECHO)');
    if (!e || !names.has(e.trigPin)) errs.push('ultrasonic needs echo.trigPin (TRIG)');
    if (e && !(e.minCm >= 0 && e.maxCm > e.minCm && e.maxCm <= 2000)) errs.push('echo needs 0 ≤ minCm < maxCm ≤ 2000');
    if (e?.beyondUs !== undefined && !(e.beyondUs > 0 && e.beyondUs <= 200000)) errs.push('echo.beyondUs must be 1–200000 µs');
  }
  if (s.kind === 'resistive-sensor') {
    if (!s.resistive?.length && !s.shunt) errs.push('resistive-sensor needs resistive elements or a shunt');
    for (const r of s.resistive ?? []) {
      if (!names.has(r.pin) || (r.to && !names.has(r.to))) errs.push(`resistive element ${r.pin}${r.to ? `–${r.to}` : ''}: not a pin`);
      if (r.control && !keys.has(r.control)) errs.push(`resistive control ${r.control} is not a control`);
      const pos = (x?: number) => x !== undefined && x > 0;
      if ((r.curve === 'linear' || r.curve === 'log') && !(pos(r.rAtMin) && pos(r.rAtMax))) errs.push(`resistive ${r.pin}: ${r.curve} needs rAtMin and rAtMax > 0`);
      else if (r.curve === 'ntc' && !(pos(r.r0) && pos(r.beta))) errs.push(`resistive ${r.pin}: ntc needs r0 and beta`);
      else if (r.curve === 'power' && !(pos(r.rRef) && pos(r.ref) && r.exponent !== undefined)) errs.push(`resistive ${r.pin}: power needs rRef, ref and exponent`);
      else if (!['linear', 'log', 'ntc', 'power'].includes(r.curve)) errs.push(`resistive ${r.pin}: curve must be linear, log, ntc or power`);
    }
    const sh = s.shunt;
    if (sh && (!names.has(sh.pin) || (sh.to && !names.has(sh.to)))) errs.push('shunt pin is not a pin');
    if (sh && !(sh.vAtMin > 0 && sh.vAtMax > 0)) errs.push('shunt needs vAtMin and vAtMax');
    if (sh?.control && !keys.has(sh.control)) errs.push(`shunt control ${sh.control} is not a control`);
  }
  for (const p of spec.pins) if (p.load && (!(p.load.ohms >= 10 && p.load.ohms <= 10_000_000) || !['3v3', 'gnd', 'supply'].includes(p.load.to))) errs.push(`load on ${p.name} needs ohms 10 Ω – 10 MΩ and to '3v3', 'gnd' or 'supply'`);
  if ((s.wordOrder || s.pec) && (s.kind !== 'i2c-device' || s.regWidth !== 16)) errs.push('wordOrder and pec are for i2c-devices with regWidth 16');
  if (s.kind === 'ir-receiver') {
    if (!s.outputPin || !names.has(s.outputPin)) errs.push('ir-receiver needs outputPin (the demodulated OUT pin)');
    if (!['nec', 'nec-ext'].includes(s.ir?.protocol ?? '')) errs.push("ir-receiver needs ir.protocol 'nec' or 'nec-ext'");
  }
  const hexReg = (r: unknown) => typeof r === 'string' && /^0x[0-9a-f]{1,2}$/i.test(r);
  if (s.fifo) {
    const f = s.fifo;
    if (s.kind !== 'i2c-device' || s.regWidth === 16 || s.pointerless) errs.push('fifo is for byte-register i2c-devices');
    for (const k of ['data', 'writePtr', 'readPtr', 'overflow'] as const) if (!hexReg(f[k])) errs.push(`fifo.${k} must be a register like 0x07`);
    if (!(f.depth >= 2 && (f.depth & (f.depth - 1)) === 0 && f.depth <= 256)) errs.push('fifo.depth must be a power of two (e.g. 32)');
    if (!(f.bytes >= 1 && f.bytes <= 4) || !(f.sampleBits >= 1 && f.sampleBits <= f.bytes * 8)) errs.push('fifo needs bytes 1–4 per channel and sampleBits that fit in them');
    if (!f.channels?.length) errs.push('fifo needs channels');
    for (const c of f.channels ?? []) {
      if (!keys.has(c.control)) errs.push(`fifo channel control ${c.control} is not a control`);
      if (typeof c.depth === 'string' ? !keys.has(c.depth) : c.depth !== undefined && !(c.depth >= 0 && c.depth <= 1)) errs.push(`fifo channel ${c.control}: depth is a fraction 0–1 or a control key`);
    }
    if (!keys.has(f.bpmControl)) errs.push(`fifo.bpmControl ${f.bpmControl} is not a control`);
    const fields: [string, { reg: string; mask: number } | undefined][] = [['mode', f.mode], ['rate', f.rate], ['average', f.average], ['resolution', f.resolution], ['status.almostFullSlots', f.status?.almostFullSlots]];
    for (const [n, fl] of fields) if (fl && (!hexReg(fl.reg) || !(fl.mask > 0 && fl.mask <= 0xff))) errs.push(`fifo.${n} needs reg (hex) and a mask 1–0xFF`);
    if (!f.mode || !Object.keys(f.mode.channels ?? {}).length) errs.push('fifo.mode.channels must map mode values to channel counts');
    for (const n of Object.values(f.mode?.channels ?? {})) if (!(n >= 1 && n <= (f.channels?.length ?? 0))) errs.push('fifo.mode.channels counts must be 1…number of channels');
    if (!f.rate?.hz?.length || f.rate.hz.some((h) => !(h > 0))) errs.push('fifo.rate.hz lists the sample rate (Hz) per field value');
    if (f.resolution && f.resolution.bits.some((b) => !(b >= 1 && b <= f.sampleBits))) errs.push('fifo.resolution.bits must be ≤ sampleBits');
    if (f.rollover && (!hexReg(f.rollover.reg) || !(f.rollover.bit >= 0 && f.rollover.bit <= 7))) errs.push('fifo.rollover needs reg (hex) and bit 0–7');
    if (f.status && !hexReg(f.status.reg)) errs.push('fifo.status.reg must be a register like 0x00');
  }
  for (const c of s.selfClearing ?? []) if (s.kind !== 'i2c-device' || !hexReg(c.reg) || !(c.mask > 0 && c.mask <= 0xff)) errs.push('selfClearing entries need an i2c-device byte register (hex) and a mask 1–0xFF');
  for (const r of s.responses ?? []) {
    if (!/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`response match "${r.match}" must be hex bytes like "24 00"`);
    const bits = segBits(r.bytes);
    if (bits % 8) errs.push(`response "${r.match}" is ${bits} bits, not whole bytes`);
    for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`response field control ${b.control} is not a control`);
    for (const b of r.bytes) if ('split' in b && (b.bits < 4 || b.bits > 8 || (b.signBit !== undefined && b.signBit >= b.bits))) errs.push(`response "${r.match}": a split field is 4-8 bits with signBit inside it`);
  }
  for (const d of s.digitalOutputs ?? []) if (!names.has(d.pin)) errs.push(`digital output ${d.pin} is not a pin`);
  for (const p of s.inputPins ?? []) if (!names.has(p)) errs.push(`input ${p} is not a pin`);
  if (s.wave) {
    if (s.kind !== 'analog-sensor' || !s.outputPin) errs.push('wave needs an analog-sensor with outputPin');
    if (!keys.has(s.wave.ampControl)) errs.push(`wave ampControl ${s.wave.ampControl} is not a control`);
    if (s.wave.freqControl && !keys.has(s.wave.freqControl)) errs.push(`wave freqControl ${s.wave.freqControl} is not a control`);
    if (!s.wave.freqHz && !s.wave.freqControl) errs.push('wave needs freqHz or freqControl');
  }
  for (const o of s.analogOutputs ?? []) {
    if (!names.has(o.pin)) errs.push(`analog output ${o.pin} is not a pin`);
    if (!keys.has(o.control)) errs.push(`analog output control ${o.control} is not a control`);
  }
  return errs;
}
