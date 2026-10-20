// The example gallery: ten-plus complete projects, each built by the same planner a user's
// prompt goes through, so every example is also a regression test of the whole pipeline.
import type { Project } from './types';
import { planFromPrompt } from './planner';
import { ADVANCED_FIRMWARE } from './firmware';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  prompt: string;
  board: 'esp32' | 'pico' | 'rpi4' | 'none';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  /** What to try in the simulator. */
  tryIt: string[];
  /** Key into ADVANCED_FIRMWARE: a hand-written main.py replacing the generated one. */
  firmware?: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'esp32-weather-imu',
    title: 'Weather & motion station',
    blurb: 'ESP32 with an OLED, two buttons, a DHT22 and an MPU-6050. Shows readings and a bubble level.',
    prompt: 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU',
    board: 'esp32',
    level: 'Intermediate',
    tryIt: ['Drag the temperature slider on the DHT22 and watch the OLED update.', 'Press button A to switch to the bubble-level screen, then tilt the IMU.', 'Shake the IMU and press button B to reset the shake counter.'],
  },
  {
    id: 'pico-traffic-light',
    title: 'Traffic light',
    blurb: 'Raspberry Pi Pico cycling red, amber and green LEDs — the classic first project.',
    prompt: 'Raspberry Pi Pico traffic light',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Press Run and watch the 10-second red → green → amber cycle.', 'Open the Code tab and change the timings.'],
  },
  {
    id: 'esp32-parking-sensor',
    title: 'Parking sensor',
    blurb: 'HC-SR04 ultrasonic sensor and a buzzer that beeps faster as you get closer, with a warning LED.',
    prompt: 'ESP32 parking sensor with an ultrasonic distance sensor, a buzzer and a red LED',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Slide the distance down below 100 cm — the beeps speed up.', 'Below 20 cm the red LED comes on.'],
  },
  {
    id: 'pico-servo-dial',
    title: 'Servo dial',
    blurb: 'Turn a potentiometer and a servo follows — the basis of every robot arm.',
    prompt: 'Raspberry Pi Pico servo controlled by a potentiometer knob',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Turn the knob and watch the servo horn follow.'],
  },
  {
    id: 'rpi-plant-waterer',
    title: 'Plant waterer',
    blurb: 'Raspberry Pi with a soil moisture probe (via an MCP3008), a 16×2 LCD and a pump relay.',
    prompt: 'Raspberry Pi plant monitor with a soil moisture sensor, a relay for a water pump and an LCD',
    board: 'rpi4',
    level: 'Intermediate',
    tryIt: ['Drop the soil moisture below 30 % — the pump relay clicks on.', 'Raise it above 60 % and the pump stops.'],
  },
  {
    id: 'esp32-motion-alarm',
    title: 'Motion alarm',
    blurb: 'PIR sensor, siren buzzer, warning LED and an arm/disarm button.',
    prompt: 'ESP32 motion alarm with a PIR sensor, a buzzer, a red LED and a button',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Press "Motion" on the PIR sensor — the siren sounds.', 'Press the button to disarm the alarm.'],
  },
  {
    id: 'pico-night-light',
    title: 'Automatic night light',
    blurb: 'A photoresistor measures the light; a white LED fades up as it gets dark.',
    prompt: 'Pico night light with a light sensor',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Lower the light level and watch the LED brighten.'],
  },
  {
    id: 'esp32-neopixel-thermo',
    title: 'NeoPixel thermometer',
    blurb: 'A 12-LED NeoPixel ring glows blue when cold and red when hot.',
    prompt: 'ESP32 with a neopixel ring that shows the temperature from a DHT22',
    board: 'esp32',
    level: 'Intermediate',
    tryIt: ['Move the temperature from 15 °C to 35 °C — the ring changes colour.'],
  },
  {
    id: 'rpi-thermostat',
    title: 'Fan thermostat',
    blurb: 'Raspberry Pi reads a DHT22, shows it on an OLED and switches a fan relay above 28 °C.',
    prompt: 'Raspberry Pi thermostat with a DHT22 temperature sensor, an OLED display and a relay for a fan',
    board: 'rpi4',
    level: 'Intermediate',
    tryIt: ['Raise the temperature above 28 °C — the fan relay switches on.'],
  },
  {
    id: 'esp32-tilt-game',
    title: 'Tilt maze level',
    blurb: 'An IMU-driven bubble level on an OLED with a buzzer click when you tilt too far.',
    prompt: 'ESP32 tilt meter with an IMU, an OLED and a buzzer',
    board: 'esp32',
    level: 'Beginner',
    tryIt: ['Tilt the IMU sliders and watch the dot move.', 'Press Shake for a buzz.'],
  },
  {
    id: 'pico-mood-lamp',
    title: 'RGB mood lamp',
    blurb: 'An RGB LED cycles through the rainbow; a knob sets the colour.',
    prompt: 'Pico RGB mood light with an RGB LED and a knob',
    board: 'pico',
    level: 'Beginner',
    tryIt: ['Turn the knob to pick a colour.'],
  },
  {
    id: '555-blinker',
    title: '555 LED blinker',
    blurb: 'No microcontroller: an NE555 timer, two resistors and a capacitor blink an LED at 1.4 Hz.',
    prompt: '555 timer LED blinker with no microcontroller',
    board: 'none',
    level: 'Beginner',
    tryIt: ['Press Run and watch the LED blink by itself.', 'Change R2 or the capacitor in the Inspector and run again.'],
  },
  {
    id: '555-tone',
    title: '555 tone generator',
    blurb: 'No code at all: a 555 timer oscillating at about 465 Hz drives a piezo buzzer while you hold the button.',
    prompt: 'a 555 timer that drives a buzzer, with a button',
    board: 'none',
    level: 'Beginner',
    tryIt: ['Press Run, then hold the button: the buzzer sounds (turn Sound on to hear it).', 'Change R2 or the timing capacitor in the Inspector to change the pitch.'],
  },
  {
    id: 'transistor-switch',
    title: 'Transistor button light',
    blurb: 'A push button drives an NPN transistor that switches an LED — how every motor driver works.',
    prompt: 'transistor led switch with a button and no microcontroller',
    board: 'none',
    level: 'Beginner',
    tryIt: ['Hold the button: the transistor turns on and the LED lights.'],
  },
  {
    id: 'esp32-eink-weather',
    title: 'E-ink weather station',
    blurb: 'A 2.9″ e-paper dashboard with a drawn weather icon, big outside temperature, a 3-day forecast from the internet and the room climate from a DHT22.',
    prompt: 'ESP32 e-ink weather station with an indoor temperature sensor and a refresh button that gets the forecast from the internet',
    board: 'esp32',
    level: 'Advanced',
    firmware: 'esp32-eink-weather',
    tryIt: ['Press Run: it joins Wi-Fi, downloads the forecast and draws the dashboard (the e-ink takes ~2 s to refresh).', 'Change the DHT22 temperature, wait a minute and press the button — the indoor panel updates.', 'Press the button twice quickly: the second update waits, because e-ink is never refreshed more than once a minute.', 'Switch the board\'s Wi-Fi off and press the button to see the offline message.'],
  },
  {
    id: 'esp32-internet-clock',
    title: 'Internet alarm clock',
    blurb: 'Sets itself from an internet time server, shows time, date and room temperature on a 16×2 LCD, and beeps you awake. Snooze and alarm on/off buttons.',
    prompt: 'ESP32 internet alarm clock with an LCD, a DHT22 temperature sensor, a buzzer and two buttons',
    board: 'esp32',
    level: 'Advanced',
    firmware: 'esp32-internet-clock',
    tryIt: ['Press Run: the clock sets itself over NTP and shows local time (UTC_OFFSET_H in the code).', 'Set ALARM_TIME in the code to a minute from now and run again: the buzzer beeps.', 'Press button A to snooze for 5 minutes ("z" on the LCD); press button B to switch the alarm off ("*" marks it on).'],
  },
  {
    id: 'pico-simon',
    title: 'Simon memory game',
    blurb: 'The classic memory game: four coloured LEDs with their own tones, four matching buttons, a growing random sequence and a high score on the OLED.',
    prompt: 'Raspberry Pi Pico Simon memory game with four LEDs, four buttons, a buzzer and an OLED',
    board: 'pico',
    level: 'Advanced',
    firmware: 'pico-simon',
    tryIt: ['Press any button to start, watch the light, then press the button of the same colour.', 'Each round adds one colour and plays a little faster.', 'Press a wrong colour to see Game over — the serial console prints the sequence if you need a hint.'],
  },
  {
    id: 'esp32-pedometer',
    title: 'Step counter',
    blurb: 'Real step detection on MPU-6050 data (filtered magnitude + peak detection) with cadence, distance, calories and a one-minute bar graph on an OLED.',
    prompt: 'ESP32 step counter with an accelerometer, an OLED and a button',
    board: 'esp32',
    level: 'Advanced',
    firmware: 'esp32-pedometer',
    tryIt: ['Switch the IMU\'s "Walking" toggle on: steps and cadence (~108 steps/min) count up.', 'Switch walking off: the count stops and the bar graph scrolls along.', 'Press the button to reset.'],
  },
  {
    id: 'rpi-weather-dashboard',
    title: 'Raspberry Pi weather dashboard',
    blurb: 'Downloads the Open-Meteo forecast with requests, shows NOW / TODAY / 3-DAY pages on an OLED and lights a red LED when rain is likely today.',
    prompt: 'Raspberry Pi weather dashboard with an OLED, a button and a red LED rain warning that gets the forecast from the internet',
    board: 'rpi4',
    level: 'Advanced',
    firmware: 'rpi-weather-dashboard',
    tryIt: ['Press Run: the forecast downloads and the NOW page appears.', 'Press the button to flip to TODAY and the 3-day page.', 'The red LED lights when today\'s rain chance is 50 % or more (change RAIN_WARN_PCT to try it).'],
  },
];

/** What the hand-written firmware of each advanced example does (for the build guide and blog). */
const ADVANCED_BEHAVIOR: Record<string, NonNullable<Project['behavior']>> = {
  'esp32-eink-weather': [
    { does: 'At power-up it joins your Wi-Fi, sets its clock from the internet and downloads the current weather and a 3-day forecast from open-meteo.com (free, no account needed).', test: 'Watch the serial console: you should see "Wi-Fi connected", the forecast request and the temperatures.', sim: 'Press Run and watch the serial monitor.' },
    { does: 'The e-ink screen shows a weather icon, the outside temperature in big digits, today’s high and low, the indoor temperature and humidity from the DHT22, a 3-day forecast strip and the time of the last update.', test: 'After about 2 seconds of flashing, the dashboard appears and stays even if you unplug the board.', sim: 'The e-paper picture on the breadboard is exactly what the panel would show.' },
    { does: 'It refreshes by itself every 15 minutes, or straight away when you press the button — but never more than once a minute, to look after the e-ink.', test: 'Press the button: the screen redraws within a minute.', sim: 'Press the button twice quickly and see the second update wait.' },
    { does: 'If Wi-Fi or the weather service is down, it shows a clear message on the screen and tries again later.', test: 'Turn your router off (or use a wrong password) and restart: you should see the offline message.', sim: 'Untick "Wi-Fi network in range" on the ESP32 and press the button.' },
  ],
  'esp32-internet-clock': [
    { does: 'It sets the time over the internet (NTP) and shows the time and date on the first line of the LCD, adjusted by your time-zone offset.', test: 'After power-up the LCD shows the correct local time within a few seconds.', sim: 'Press Run and read the LCD.' },
    { does: 'The second line shows the room temperature and humidity from the DHT22 and the alarm time, with * when the alarm is on.', test: 'Breathe on the sensor: the humidity rises within a few seconds.', sim: 'Move the DHT22 sliders.' },
    { does: 'At the alarm time the buzzer beeps a pattern. Button A snoozes it for 5 minutes (z on the LCD); button B turns the alarm on or off.', test: 'Set ALARM_TIME to a minute from now, wait, then try both buttons.', sim: 'Set ALARM_TIME in the Code tab, Run, then press the buttons.' },
  ],
  'pico-simon': [
    { does: 'Press any button to start. The Pico plays a sequence of coloured lights, each with its own tone, and you repeat it by pressing the button of the same colour.', test: 'Press a button: the first light and tone play; press the matching button to go to level 2.', sim: 'Click the buttons on the breadboard.' },
    { does: 'Each round adds one more colour and plays a little faster; the OLED shows your level and best score.', test: 'Get a few rounds right and watch the level on the OLED go up.', sim: 'Read the OLED as you play.' },
    { does: 'A wrong press plays a low buzz and shows "Game over" with your score; press any button to play again.', test: 'Press a wrong colour on purpose.', sim: 'The serial monitor prints the sequence if you want to cheat while testing.' },
  ],
  'esp32-pedometer': [
    { does: 'It reads the MPU-6050 accelerometer 50 times a second, smooths the signal and counts a step at each peak (with a minimum gap of 250 ms so one step is never counted twice).', test: 'Walk around holding the circuit: the count goes up once per step.', sim: 'Switch on "Walking (steps)" on the IMU.' },
    { does: 'The OLED shows steps, cadence (steps per minute), estimated distance and calories, plus a bar graph of steps per 10 seconds over the last minute.', test: 'Walk for a minute and check the cadence is around 100–120.', sim: 'Leave walking on for 20 seconds and watch the bars grow.' },
    { does: 'Press the button to reset everything to zero.', test: 'Press the button: the counters reset.', sim: 'Press the button on the breadboard.' },
  ],
  'rpi-weather-dashboard': [
    { does: 'The Raspberry Pi downloads the forecast from open-meteo.com every 10 minutes using the requests library.', test: 'Run python3 main.py and watch the terminal for the forecast lines.', sim: 'Press Run and read the serial monitor.' },
    { does: 'The OLED has three pages — now, today and the next 3 days — and the button flips between them.', test: 'Press the button and check each page appears in turn.', sim: 'Click the button on the breadboard.' },
    { does: 'The red LED lights when there is a 50 % or higher chance of rain today, so you know to take an umbrella.', test: 'Change RAIN_WARN_PCT to 10 and restart: the LED should light.', sim: 'Change RAIN_WARN_PCT in the Code tab and run again.' },
  ],
};

export function buildExample(id: string): Project {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`Unknown example ${id}`);
  // The card title is the project name everywhere (UI, OLED splash, docs).
  const p = planFromPrompt(ex.prompt, undefined, ex.title);
  const project: Project = { ...p, prompt: ex.prompt, id: `${ex.id}-${Date.now().toString(36)}` };
  if (ex.firmware) {
    // Advanced examples: hand-written main.py; driver files still come from the generated project.
    const main = ADVANCED_FIRMWARE[ex.firmware];
    if (!main) throw new Error(`Missing firmware ${ex.firmware}`);
    project.name = ex.title;
    project.files = { ...p.files, 'main.py': main };
    project.codeCustom = true;
    project.behavior = ADVANCED_BEHAVIOR[ex.id];
  }
  return project;
}
