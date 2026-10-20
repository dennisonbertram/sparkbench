// Hand-written firmware for the "Advanced" gallery examples. The planner still builds the
// circuit (parts, wiring, driver files); these programs replace the generated main.py.
// Pin numbers below match what planFromPrompt assigns for each example's prompt — if you
// change a prompt in examples.ts, re-check the pins (tests/sim/advanced.test.ts will notice).

// ------------------------------------------------------------------ E-ink weather station

const EINK_WEATHER = String.raw`# E-ink Weather Station
# Sparkbench advanced example for the ESP32 DevKit V1 (MicroPython).
#
# A 2.9" e-paper weather dashboard: a drawn weather icon, the outside temperature in big
# digits, today's high/low, the room temperature and humidity from a DHT22, and a 3-day
# forecast strip. The forecast comes from open-meteo.com (free, no API key) over Wi-Fi.
#
# Wiring:
#   E-paper display     CLK=GPIO18  DIN=GPIO23  CS=GPIO5  DC=GPIO4  RST=GPIO13  BUSY=GPIO16
#   DHT22 (indoor)      DATA=GPIO17
#   Refresh button      GPIO19 (internal pull-up, button to GND)
#
# How it behaves:
#   - fetches new weather every 15 minutes, or when you press the button
#   - e-ink refreshes are slow (~2 s) and wear the panel, so it redraws at most once a minute
#   - if Wi-Fi or the download fails it says so on the screen and tries again a minute later

from machine import Pin, SPI
import time
import math
import network
import urequests as requests
import ntptime
import dht
import epaper2in9

# ---- settings you can tweak ----
WIFI_SSID = "MyHomeWiFi"        # your Wi-Fi network name
WIFI_PASSWORD = "change-me"     # your Wi-Fi password
LATITUDE = 40.71                # where to get the weather for (New York; change to yours)
LONGITUDE = -74.01
PLACE = "New York"              # shown in the corner of the screen
UPDATE_EVERY_S = 15 * 60        # normal refresh: every 15 minutes
RETRY_S = 60                    # after a failure, try again this soon
EPD_MIN_S = 60                  # never redraw the e-ink more often than this
LOOP_MS = 50                    # main loop period

# ---- hardware setup ----
spi = SPI(2, baudrate=4_000_000, sck=Pin(18), mosi=Pin(23))
epd = epaper2in9.EPD(spi, cs=Pin(5), dc=Pin(4), rst=Pin(13), busy=Pin(16))
indoor = dht.DHT22(Pin(17))
button = Pin(19, Pin.IN, Pin.PULL_UP)  # pressed = 0
wlan = network.WLAN(network.STA_IF)

W = 296   # screen width in pixels (landscape)
H = 128   # screen height

# ---- weather codes ----
# WMO weather codes used by Open-Meteo (https://open-meteo.com/en/docs) -> short words.
SKY = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Icy fog",
       51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 56: "Icy drizzle", 57: "Icy drizzle",
       61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Icy rain", 67: "Icy rain",
       71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
       80: "Showers", 81: "Showers", 82: "Downpour", 85: "Snow showers", 86: "Snow showers",
       95: "Thunder", 96: "Thunder", 99: "Thunder"}

# One short word per icon, for the narrow forecast columns.
SHORT = {"sun": "Sunny", "partly": "Partly", "cloud": "Cloudy", "fog": "Fog",
         "rain": "Rain", "snow": "Snow", "thunder": "Storms"}

DAY_NAMES = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")


def icon_for(code):
    """Which picture to draw for a weather code."""
    if code <= 1:
        return "sun"
    if code == 2:
        return "partly"
    if code in (45, 48):
        return "fog"
    if code >= 95:
        return "thunder"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if code >= 51:
        return "rain"
    return "cloud"


# ---- helpers: network ----
WEATHER_URL = ("https://api.open-meteo.com/v1/forecast?latitude={:.4f}&longitude={:.4f}"
               "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"
               "&daily=weather_code,temperature_2m_max,temperature_2m_min"
               "&timezone=auto&forecast_days=3")


def connect_wifi():
    """Join the Wi-Fi network (waits up to 10 s). Returns True when connected."""
    wlan.active(True)
    if wlan.isconnected():
        return True
    print("Connecting to Wi-Fi", WIFI_SSID, "...")
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    for _ in range(100):
        if wlan.isconnected():
            print("Wi-Fi connected:", wlan.ifconfig()[0])
            return True
        time.sleep_ms(100)
    print("Wi-Fi NOT connected")
    return False


def sync_clock():
    """Set the board's clock (UTC) from an internet time server. True on success."""
    try:
        ntptime.settime()
        print("Clock set from the internet")
        return True
    except OSError:
        print("Could not get the time from the internet")
        return False


def fetch_weather():
    """Download current weather + 3-day forecast. Returns a dict, or None on failure."""
    try:
        r = requests.get(WEATHER_URL.format(LATITUDE, LONGITUDE))
        if r.status_code != 200:
            print("Weather server said HTTP", r.status_code)
            r.close()
            return None
        data = r.json()
        r.close()
        cur = data["current"]
        day = data["daily"]
        days = []
        for i in range(min(3, len(day["time"]))):
            days.append((day["time"][i], day["weather_code"][i],
                         day["temperature_2m_max"][i], day["temperature_2m_min"][i]))
        return {"temp": cur["temperature_2m"], "hum": cur["relative_humidity_2m"],
                "code": cur["weather_code"], "wind": cur["wind_speed_10m"],
                "time": cur["time"], "offset": data.get("utc_offset_seconds", 0), "days": days}
    except Exception as e:  # no network, bad JSON, missing field...
        print("Weather download failed:", e)
        return None


def read_indoor():
    """(temperature C, humidity %) from the DHT22, or None if it didn't answer."""
    try:
        indoor.measure()
        return indoor.temperature(), indoor.humidity()
    except OSError as e:
        print("DHT22 read failed:", e)
        return None


# ---- helpers: dates and time ----
def weekday(date):
    """Day name for a "YYYY-MM-DD" string (Sakamoto's method, 0 = Sunday)."""
    y, m, d = int(date[0:4]), int(date[5:7]), int(date[8:10])
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return DAY_NAMES[(y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7]


def local_hhmm(w):
    """Local time as "HH:MM": board clock + the time-zone offset Open-Meteo reported."""
    if clock_ok:
        t = time.localtime(time.time() + w["offset"])
        return "{:02d}:{:02d}".format(t[3], t[4])
    return w["time"][11:16]  # no NTP: fall back to the time of the weather reading


# ---- helpers: drawing (colour 1 = black, 0 = white) ----
def disc(cx, cy, r, c=1):
    """Filled circle, drawn as one horizontal line per row."""
    for dy in range(-r, r + 1):
        dx = int(math.sqrt(r * r - dy * dy) + 0.5)
        epd.hline(cx - dx, cy + dy, 2 * dx + 1, c)


def thick_line(x0, y0, x1, y1, k):
    """A line k pixels thick (k = 1 or 2)."""
    epd.line(x0, y0, x1, y1, 1)
    if k > 1:
        epd.line(x0 + 1, y0, x1 + 1, y1, 1)


def sun(cx, cy, r, k):
    """A black disc with 8 rays around it."""
    disc(cx, cy, r)
    for dx, dy in ((10, 0), (7, 7), (0, 10), (-7, 7), (-10, 0), (-7, -7), (0, -10), (7, -7)):
        r1 = r + 2 * k
        r2 = r + 4 * k
        thick_line(cx + dx * r1 // 10, cy + dy * r1 // 10, cx + dx * r2 // 10, cy + dy * r2 // 10, k)


def cloud(x, y, k):
    """An outlined white cloud: three overlapping circles on a flat base.
    Drawn twice: black and a bit bigger first, then white on top, which leaves an outline."""
    for c, grow in ((1, k), (0, 0)):
        disc(x + 7 * k, y + 14 * k, 5 * k + grow, c)
        disc(x + 13 * k, y + 10 * k, 7 * k + grow, c)
        disc(x + 19 * k, y + 15 * k, 4 * k + grow, c)
        epd.fill_rect(x + 7 * k, y + 12 * k, 12 * k + 1, 7 * k + 1 + grow, c)


def draw_icon(kind, x, y, k):
    """Weather picture in a 24k x 24k box at (x, y). k = 2 gives 48 px, k = 1 gives 24 px."""
    if kind == "sun":
        sun(x + 12 * k, y + 12 * k, 5 * k, k)
    elif kind == "partly":
        sun(x + 9 * k, y + 8 * k, 4 * k, k)
        cloud(x + k, y + 5 * k, k)
    elif kind == "cloud":
        cloud(x, y + 2 * k, k)
    elif kind == "fog":
        cloud(x, y - k, k)
        for i in range(2):
            epd.fill_rect(x + 4 * k, y + (20 + 3 * i) * k, 17 * k, k, 1)
    else:
        cloud(x, y - 2 * k, k)  # rain, snow and thunder: cloud up top, weather below it
        if kind == "rain":
            for i in range(3):
                thick_line(x + (9 + 5 * i) * k, y + 19 * k, x + (7 + 5 * i) * k, y + 23 * k, k)
        elif kind == "snow":
            for sx, sy in ((7, 19), (12, 21), (17, 19), (9, 23), (15, 23)):
                epd.fill_rect(x + sx * k, y + sy * k, k + 1, k + 1, 1)
        else:  # thunder: a zig-zag lightning bolt
            pts = ((14, 17), (10, 21), (14, 21), (10, 25))
            for i in range(3):
                thick_line(x + pts[i][0] * k, y + pts[i][1] * k, x + pts[i + 1][0] * k, y + pts[i + 1][1] * k, k)


def degree(x, y, r):
    """Small degree ring."""
    disc(x, y, r, 1)
    disc(x, y, r - 2 if r > 2 else 1, 0)


def center_x(text, x0, width, size=8):
    """x position that centres text (size px per character) in a column."""
    return x0 + (width - len(text) * size) // 2


def draw_dashboard(w, room, problem):
    """Draw the whole weather screen and refresh the e-ink."""
    epd.fill(0)
    # -- today: icon, big temperature, condition, high/low
    draw_icon(icon_for(w["code"]), 6, 6, 2)
    temp = "{:d}".format(round(w["temp"]))
    epd.big_text(temp, 64, 8, 4, 1)              # 32 px tall digits
    tx = 64 + len(temp) * 32
    degree(tx + 5, 12, 4)
    epd.big_text("C", tx + 12, 8, 2, 1)
    epd.text(SKY.get(w["code"], "?"), 64, 46, 1)
    today = w["days"][0] if w["days"] else None
    if today:
        epd.text("H {:d}  L {:d}".format(round(today[2]), round(today[3])), 64, 56, 1)
    # -- indoor panel on the right
    epd.vline(200, 4, 58, 1)
    epd.text("INDOOR", 210, 6, 1)
    if room:
        epd.big_text("{:.1f}".format(room[0]), 210, 20, 2, 1)
        epd.text("C", 210 + len("{:.1f}".format(room[0])) * 16 + 2, 28, 1)
        epd.text("{:.0f} %RH".format(room[1]), 210, 44, 1)
    else:
        epd.text("no sensor", 210, 28, 1)
    epd.text("Wind {:.0f}".format(w["wind"]), 210, 54, 1)
    # -- 3-day forecast strip
    epd.hline(0, 66, W, 1)
    col = W // 3
    for i, (date, code, hi, lo) in enumerate(w["days"]):
        x0 = i * col
        if i:
            epd.vline(x0, 70, 40, 1)
        epd.text(weekday(date), x0 + 8, 72, 1)
        draw_icon(icon_for(code), x0 + 6, 84, 1)
        epd.text("Hi {:d}".format(round(hi)), x0 + 40, 74, 1)
        epd.text("Lo {:d}".format(round(lo)), x0 + 40, 86, 1)
        epd.text(SHORT[icon_for(code)], x0 + 40, 100, 1)
    # -- footer
    epd.hline(0, 113, W, 1)
    epd.text(PLACE[:18], 4, 118, 1)
    footer = problem + " - retrying" if problem else "Updated " + local_hhmm(w)
    epd.text(footer, W - 4 - len(footer) * 8, 118, 1)
    epd.show()  # takes about 2 seconds


def draw_problem(title, detail):
    """Full-screen message when there is no weather to show yet."""
    epd.fill(0)
    epd.rect(4, 4, W - 8, H - 8, 1)
    epd.big_text(title, center_x(title, 0, W, 24), 24, 3, 1)
    epd.text(detail, center_x(detail, 0, W), 66, 1)
    msg = "Trying again every minute"
    epd.text(msg, center_x(msg, 0, W), 84, 1)
    msg = "or press the button"
    epd.text(msg, center_x(msg, 0, W), 98, 1)
    epd.show()


class Edge:
    """Turns a button pin into "was it just pressed?" events (with debounce)."""
    def __init__(self, pin):
        self.pin = pin
        self.last = 1
        self.t = 0

    def pressed(self):
        v = self.pin.value()
        hit = False
        if v != self.last and time.ticks_diff(time.ticks_ms(), self.t) > 30:
            self.t = time.ticks_ms()
            hit = v == 0  # pulled up: 0 means pressed
            self.last = v
        return hit


# ---- one complete update: network -> weather -> screen ----
def update():
    """Fetch the weather and redraw. Returns True if fresh weather was shown."""
    global weather, clock_ok, shown
    problem = None
    if not connect_wifi():
        problem = "No Wi-Fi"
        detail = "Check WIFI_SSID / WIFI_PASSWORD"
    else:
        if not clock_ok:
            clock_ok = sync_clock()
        w = fetch_weather()
        if w:
            weather = w
            today = w["days"][0] if w["days"] else ("", 0, 0, 0)
            print("Now {:.1f} C {}, high {:.0f} / low {:.0f}".format(w["temp"], SKY.get(w["code"], "?"), today[2], today[3]))
            print("Forecast: " + " | ".join("{} {:.0f}/{:.0f} {}".format(weekday(d[0]), d[2], d[3], SKY.get(d[1], "?")) for d in w["days"]))
        else:
            problem = "Offline"
            detail = "Could not download the forecast"
    room = read_indoor()
    if room:
        print("Indoor {:.1f} C {:.0f} %".format(room[0], room[1]))
    # What the screen should show. If it's the same failure as last time, don't redraw:
    # a frozen e-ink picture is fine and saves the panel.
    key = (problem, weather["time"] if weather else None, room)
    if problem and key == shown:
        print(problem, "- screen unchanged")
        return False
    if weather:
        draw_dashboard(weather, room, problem)
    else:
        draw_problem(problem, detail)
    shown = key
    return problem is None


# ---- state ----
weather = None          # last good forecast (kept when a later update fails)
clock_ok = False        # True once the clock has been set over NTP
shown = None            # what the e-ink shows now
last_epd = None         # when the e-ink was last redrawn
next_update = time.ticks_ms()   # update straight away
btn = Edge(button)

# ---- startup ----
print("E-ink weather station starting...")

# ---- main loop ----
while True:
    now = time.ticks_ms()
    epd_ready = last_epd is None or time.ticks_diff(now, last_epd) >= EPD_MIN_S * 1000
    if btn.pressed():
        next_update = now
        if epd_ready:
            print("Refresh button pressed")
        else:
            wait_s = EPD_MIN_S - time.ticks_diff(now, last_epd) // 1000
            print("Refresh button pressed - the e-ink can refresh again in", wait_s, "s, update queued")
    due = time.ticks_diff(now, next_update) >= 0
    if due and epd_ready:
        ok = update()
        last_epd = time.ticks_ms()
        next_update = time.ticks_add(last_epd, (UPDATE_EVERY_S if ok else RETRY_S) * 1000)
    time.sleep_ms(LOOP_MS)
`;

// ------------------------------------------------------------------ Internet alarm clock

const INTERNET_CLOCK = String.raw`# Internet Alarm Clock
# Sparkbench advanced example for the ESP32 DevKit V1 (MicroPython).
#
# Gets the exact time from the internet (NTP), shows it on a 16x2 LCD with the date and
# the room temperature, and wakes you with a beeping alarm.
#
# Wiring:
#   LCD 16x2 (I2C)      SDA=GPIO21  SCL=GPIO22  (5 V)
#   DHT22               DATA=GPIO4
#   Button A (green)    GPIO13  -> snooze (5 minutes) while the alarm rings
#   Button B (red)      GPIO16  -> alarm on / off
#   Buzzer              GPIO17
#
# The LCD:
#   06:30:05  20 Oct      <- time and date
#   21.5C 45%  *07:00     <- temperature, humidity, alarm time ("*" = alarm on,
#                            "z" = snoozing, "off" = alarm off)

from machine import Pin, I2C, PWM
import time
import network
import ntptime
import dht
from i2c_lcd import I2cLcd

# ---- settings you can tweak ----
WIFI_SSID = "MyHomeWiFi"        # your Wi-Fi network name
WIFI_PASSWORD = "change-me"     # your Wi-Fi password
UTC_OFFSET_H = -4               # your time zone offset from UTC, in hours (New York summer = -4)
ALARM_TIME = (7, 0)             # wake-up time: (hour, minute), 24-hour clock
ALARM_ON = True                 # alarm armed at start-up?
SNOOZE_MIN = 5                  # snooze length in minutes
RING_MAX_S = 120                # stop ringing by itself after 2 minutes
RESYNC_H = 6                    # re-check the time online every 6 hours (the ESP32 clock drifts)
LOOP_MS = 20                    # main loop period

# ---- hardware setup ----
i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x27, 2, 16)
dht_sensor = dht.DHT22(Pin(4))
btn_snooze = Pin(13, Pin.IN, Pin.PULL_UP)   # Button A: pressed = 0
btn_alarm = Pin(16, Pin.IN, Pin.PULL_UP)    # Button B: pressed = 0
buzzer = PWM(Pin(17), freq=2000, duty_u16=0)
wlan = network.WLAN(network.STA_IF)

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# ---- helpers ----
class Edge:
    """Turns a button pin into "was it just pressed?" events (with debounce)."""
    def __init__(self, pin):
        self.pin = pin
        self.last = 1
        self.t = 0

    def pressed(self):
        v = self.pin.value()
        hit = False
        if v != self.last and time.ticks_diff(time.ticks_ms(), self.t) > 30:
            self.t = time.ticks_ms()
            hit = v == 0  # pulled up: 0 means pressed
            self.last = v
        return hit


def tone(freq):
    """Start a tone (Hz) on the buzzer, or stop it with 0."""
    if freq:
        buzzer.freq(int(freq))
        buzzer.duty_u16(32768)
    else:
        buzzer.duty_u16(0)


def beep(freq=2000, ms=60):
    tone(freq)
    time.sleep_ms(ms)
    tone(0)


def show(line1, line2):
    """Write both LCD rows, padded/cut to exactly 16 characters (no flicker from clear())."""
    lcd.move_to(0, 0)
    lcd.putstr("{:<16}".format(line1)[:16])
    lcd.move_to(0, 1)
    lcd.putstr("{:<16}".format(line2)[:16])


def connect_wifi():
    """Join the Wi-Fi network (waits up to 10 s). Returns True when connected."""
    wlan.active(True)
    if not wlan.isconnected():
        print("Connecting to Wi-Fi", WIFI_SSID, "...")
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        for _ in range(100):
            if wlan.isconnected():
                break
            time.sleep_ms(100)
    print("Wi-Fi", "connected" if wlan.isconnected() else "NOT connected")
    return wlan.isconnected()


def sync_time():
    """Set the clock from an internet time server. True on success."""
    if not connect_wifi():
        return False
    try:
        ntptime.settime()  # sets the board clock to UTC
        print("Time set from the internet")
        return True
    except OSError:
        print("Could not get the time from the internet")
        return False


def local_now():
    """Seconds since 2000/1970 (whatever the board uses) in *local* time."""
    return time.time() + UTC_OFFSET_H * 3600


def hhmm(h, m):
    return "{:02d}:{:02d}".format(h, m)


# ---- state ----
snooze_btn = Edge(btn_snooze)
alarm_btn = Edge(btn_alarm)
alarm_on = ALARM_ON
ringing = False
ring_start = 0          # ticks_ms when ringing started
snooze_until = 0        # local time (s) when a snoozed alarm rings again; 0 = not snoozing
rang_today = -1         # day number the alarm last went off (so it rings once a day)
temp_c = None
humidity = None
last_dht = time.ticks_ms() - 5000
message = ""            # short message on line 2 (e.g. "Snooze 5 min")
message_until = 0
shown = None            # what the LCD shows now
last_minute = -1
synced = False
last_sync = 0


def say(text, ms=2000):
    """Show a short message on the bottom line for a moment."""
    global message, message_until
    message = text
    message_until = time.ticks_add(time.ticks_ms(), ms)
    print(text)


def start_ringing():
    global ringing, ring_start
    ringing = True
    ring_start = time.ticks_ms()
    print("ALARM! Wake up!")


def stop_ringing():
    global ringing
    ringing = False
    tone(0)


# ---- startup ----
print("Internet alarm clock starting...")
show("Internet clock", "Getting time...")
synced = sync_time()
last_sync = time.ticks_ms()
if not synced:
    show("No time from", "the internet :(")
    time.sleep_ms(1500)
for f in (1047, 1319, 1568):  # little start-up chirp
    beep(f, 60)

# ---- main loop ----
while True:
    now = time.ticks_ms()

    # Re-sync now and then (and keep retrying every 30 s until the first sync works).
    if time.ticks_diff(now, last_sync) > (RESYNC_H * 3600 if synced else 30) * 1000:
        last_sync = now
        synced = sync_time() or synced

    # Room temperature: the DHT22 can only be read every 2 s; every 5 s is plenty.
    if time.ticks_diff(now, last_dht) >= 5000:
        last_dht = now
        try:
            dht_sensor.measure()
            temp_c = dht_sensor.temperature()
            humidity = dht_sensor.humidity()
        except OSError as e:
            print("DHT22 read failed:", e)

    secs = local_now()
    t = time.localtime(secs)   # (year, month, day, hour, minute, second, ...)
    day_number = secs // 86400

    # Buttons
    if snooze_btn.pressed():
        if ringing:
            stop_ringing()
            snooze_until = secs + SNOOZE_MIN * 60
            say("Snooze {} min".format(SNOOZE_MIN))
        else:
            say("Alarm at " + hhmm(ALARM_TIME[0], ALARM_TIME[1]))
            beep(2500, 15)
    if alarm_btn.pressed():
        alarm_on = not alarm_on
        stop_ringing()
        snooze_until = 0
        say("Alarm ON " + hhmm(ALARM_TIME[0], ALARM_TIME[1]) if alarm_on else "Alarm OFF")
        beep(1760 if alarm_on else 660, 80)

    # Is it time to wake up?
    if alarm_on and synced and not ringing:
        if (t[3], t[4]) == ALARM_TIME and rang_today != day_number:
            rang_today = day_number
            start_ringing()
        elif snooze_until and secs >= snooze_until:
            snooze_until = 0
            start_ringing()

    # Ringing: beep-beep-beep-beep ... pause, until snoozed / switched off / timed out.
    if ringing:
        ms = time.ticks_diff(now, ring_start)
        if ms > RING_MAX_S * 1000:
            stop_ringing()
            print("Alarm stopped by itself")
        else:
            phase = ms % 1000
            tone(2400 if phase < 400 and (phase // 100) % 2 == 0 else 0)

    # Display: work out both lines, and only talk to the (slow) LCD when they changed.
    if synced:
        line1 = "{:02d}:{:02d}:{:02d}  {:d} {}".format(t[3], t[4], t[5], t[2], MONTHS[t[1] - 1])
    else:
        line1 = "--:--:-- no sync"
    if ringing:
        line2 = "** WAKE UP! **" if (max(0, time.ticks_diff(now, ring_start)) // 500) % 2 == 0 else ""
    elif message and time.ticks_diff(message_until, now) > 0:
        line2 = message
    else:
        message = ""
        room = "{:.1f}C {:.0f}%".format(temp_c, humidity) if temp_c is not None else "--.-C"
        if not alarm_on:
            mark = " off"
        elif snooze_until:
            mark = "z" + hhmm((snooze_until // 3600) % 24, (snooze_until // 60) % 60)
        else:
            mark = "*" + hhmm(ALARM_TIME[0], ALARM_TIME[1])
        line2 = room + " " * max(1, 16 - len(room) - len(mark)) + mark
    if (line1, line2) != shown:
        show(line1, line2)
        shown = (line1, line2)
    if t[4] != last_minute:   # log once a minute
        last_minute = t[4]
        print("Time", line1[:8], "|", line2)

    time.sleep_ms(LOOP_MS)
`;

// ------------------------------------------------------------------ Simon memory game

const SIMON = String.raw`# Simon Memory Game
# Sparkbench advanced example for the Raspberry Pi Pico (MicroPython).
#
# The classic: Simon plays a sequence of coloured lights and tones, you repeat it with the
# buttons. Every round the sequence gets one step longer (and a little faster).
# One wrong press - or taking longer than 5 s - and it's game over.
#
# Wiring (each button lights the LED of the same colour):
#   OLED (I2C)           SDA=GP4  SCL=GP5
#   Red LED    GP9   <-> Button B (red)     GP3
#   Green LED  GP10  <-> Button A (green)   GP2
#   Blue LED   GP11  <-> Button C (blue)    GP6
#   Yellow LED GP12  <-> Button D (yellow)  GP7
#   Buzzer               GP8
#   (buttons use the internal pull-ups and connect to GND when pressed)

from machine import Pin, I2C, PWM
import time
import random
import ssd1306

# ---- settings you can tweak ----
START_ON_MS = 450       # how long each colour lights up in round 1
FASTEST_ON_MS = 180     # ... it speeds up each round down to this
GAP_MS = 200            # dark gap between colours
TIMEOUT_MS = 5000       # how long Simon waits for each press
BEST_FILE = "simon_best.txt"   # high score is saved here so it survives a restart

# ---- hardware setup ----
i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=400000)
oled = ssd1306.SSD1306_I2C(128, 64, i2c)
buzzer = PWM(Pin(8), freq=440, duty_u16=0)

# One entry per colour: (name, LED, button, tone in Hz). The tones are the original
# Simon notes, so each colour has its own sound.
COLOURS = [
    ("red", Pin(9, Pin.OUT, value=0), Pin(3, Pin.IN, Pin.PULL_UP), 310),
    ("green", Pin(10, Pin.OUT, value=0), Pin(2, Pin.IN, Pin.PULL_UP), 415),
    ("blue", Pin(11, Pin.OUT, value=0), Pin(6, Pin.IN, Pin.PULL_UP), 209),
    ("yellow", Pin(12, Pin.OUT, value=0), Pin(7, Pin.IN, Pin.PULL_UP), 252),
]


# ---- helpers ----
def tone(freq):
    """Start a tone (Hz) on the buzzer, or stop it with 0."""
    if freq:
        buzzer.freq(int(freq))
        buzzer.duty_u16(32768)
    else:
        buzzer.duty_u16(0)


def light(i, on):
    """Colour i's LED and tone on or off."""
    COLOURS[i][1].value(1 if on else 0)
    tone(COLOURS[i][3] if on else 0)


def all_leds(on):
    for c in COLOURS:
        c[1].value(1 if on else 0)


def screen(title, line1="", line2="", line3=""):
    """Title in a box at the top, up to three lines below."""
    oled.fill(0)
    oled.fill_rect(0, 0, 128, 12, 1)
    oled.text(title, (128 - len(title) * 8) // 2, 2, 0)
    for n, s in enumerate((line1, line2, line3)):
        oled.text(s, (128 - len(s) * 8) // 2, 20 + n * 14, 1)
    oled.show()


def pressed_button():
    """Index of a button that is held down right now, or -1."""
    for i, c in enumerate(COLOURS):
        if c[2].value() == 0:
            return i
    return -1


def wait_for_press(timeout_ms):
    """Wait for a button press (debounced). Returns its index, or -1 on timeout."""
    t0 = time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(), t0) < timeout_ms:
        i = pressed_button()
        if i >= 0:
            time.sleep_ms(20)          # debounce: still pressed 20 ms later?
            if COLOURS[i][2].value() == 0:
                return i
        time.sleep_ms(5)
    return -1


def wait_release(i):
    """Keep colour i lit while its button is held (at least 150 ms, at most 1.5 s)."""
    light(i, True)
    t0 = time.ticks_ms()
    while COLOURS[i][2].value() == 0 and time.ticks_diff(time.ticks_ms(), t0) < 1500:
        time.sleep_ms(10)
    while time.ticks_diff(time.ticks_ms(), t0) < 150:
        time.sleep_ms(10)
    light(i, False)
    time.sleep_ms(40)   # ignore contact bounce on release


def play_sequence(seq, on_ms):
    for i in seq:
        light(i, True)
        time.sleep_ms(on_ms)
        light(i, False)
        time.sleep_ms(GAP_MS)


def load_best():
    try:
        with open(BEST_FILE) as f:
            return int(f.read())
    except (OSError, ValueError):
        return 0


def save_best(n):
    try:
        with open(BEST_FILE, "w") as f:
            f.write(str(n))
    except OSError:
        pass  # no file system: the best score just isn't remembered


def attract(best):
    """Idle screen: chase the LEDs until any button is pressed."""
    screen("SIMON", "Press any", "button to play", "Best: {}".format(best))
    print("Press any button to start")
    n = 0
    while True:
        all_leds(False)
        COLOURS[n % 4][1].value(1)
        n += 1
        t0 = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), t0) < 250:
            i = pressed_button()
            if i >= 0:
                all_leds(False)
                while pressed_button() >= 0:   # wait for release, so this press
                    time.sleep_ms(10)          # doesn't count as the first move
                return
            time.sleep_ms(10)


def game_over(score, best, reason, want):
    print("Game over: {} - score {} (best {})".format(reason, score, best))
    screen("GAME OVER", reason, "Score: {}".format(score), "Best:  {}".format(best))
    tone(110)                               # low buzz...
    for _ in range(3):                      # ...while flashing the colour you should have pressed
        COLOURS[want][1].value(1)
        time.sleep_ms(250)
        COLOURS[want][1].value(0)
        time.sleep_ms(150)
    tone(0)
    time.sleep_ms(1500)


# ---- startup ----
best = load_best()
print("Simon starting... best score so far:", best)

# ---- main loop: one game per pass ----
while True:
    attract(best)
    random.seed(time.ticks_us())  # the moment you pressed the button decides the sequence
    seq = []
    screen("SIMON", "Get ready...")
    time.sleep_ms(800)
    while True:
        seq.append(random.randint(0, 3))
        level = len(seq)
        on_ms = max(FASTEST_ON_MS, START_ON_MS - 25 * (level - 1))
        screen("LEVEL {}".format(level), "Watch...", "", "Best: {}".format(best))
        print("Level", level)
        # debug line: lets you (and the tests) see the sequence in the serial console
        print("[debug] sequence:", " ".join(COLOURS[i][0] for i in seq))
        time.sleep_ms(500)
        play_sequence(seq, on_ms)
        screen("LEVEL {}".format(level), "Your turn!", "{} to go".format(level), "Best: {}".format(best))
        print("Your turn")
        failed = None
        for step, want in enumerate(seq):
            got = wait_for_press(TIMEOUT_MS)
            if got < 0:
                failed = ("Too slow!", want)
                break
            wait_release(got)
            if got != want:
                failed = ("Wrong colour!", want)
                break
            left = level - step - 1
            if left:
                screen("LEVEL {}".format(level), "Your turn!", "{} to go".format(left), "Best: {}".format(best))
        if failed:
            score = level - 1
            if score > best:
                best = score
                save_best(best)
            game_over(score, best, failed[0], failed[1])
            break
        # Round complete: a happy chirp, then the next (longer) round.
        print("Correct!")
        screen("LEVEL {}".format(level), "Correct!")
        time.sleep_ms(300)
        for f in (523, 659, 784):
            tone(f)
            time.sleep_ms(70)
        tone(0)
        time.sleep_ms(500)
`;

// ------------------------------------------------------------------ Step counter

const PEDOMETER = String.raw`# Step Counter
# Sparkbench advanced example for the ESP32 DevKit V1 (MicroPython).
#
# Counts your steps with an MPU-6050 accelerometer and shows steps, cadence (steps per
# minute), distance, calories and a bar graph of your last minute on an OLED.
#
# How step detection works:
#   1. Read the acceleration 50 times a second and take its size (magnitude) - that way
#      it doesn't matter how the sensor is tilted.
#   2. Smooth it with a low-pass filter to remove jitter.
#   3. Track the slow average (about 1 g, gravity). Each step makes a bump above it.
#   4. A step is counted at the top of a bump that rises more than STEP_THRESHOLD_G above
#      the average - and at least MIN_STEP_MS after the previous step (no double counts).
#
# Wiring:
#   OLED + MPU-6050 (I2C)   SDA=GPIO21  SCL=GPIO22
#   Reset button            GPIO4 (internal pull-up, button to GND)

from machine import Pin, I2C
import time
import math
import framebuf
import ssd1306
import mpu6050

# ---- settings you can tweak ----
STEP_LENGTH_M = 0.75     # your average step length in metres
WEIGHT_KG = 70           # used for the calorie estimate
STEP_THRESHOLD_G = 0.15  # how far above the average a bump must rise to be a step
REARM_G = 0.05           # ...and how far it must fall back before the next step can count
MIN_STEP_MS = 250        # nobody takes more than 4 steps a second
SMOOTHING = 0.35         # low-pass filter: 0..1, smaller = smoother but slower
SAMPLE_MS = 20           # 50 samples per second
SCREEN_MS = 250          # redraw the OLED 4 times a second
BUCKET_S = 10            # bar graph: one bar per 10 seconds...
BUCKETS = 6              # ...6 bars = the last minute

# ---- hardware setup ----
i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)
oled = ssd1306.SSD1306_I2C(128, 64, i2c)
imu = mpu6050.MPU6050(i2c)
reset_btn = Pin(4, Pin.IN, Pin.PULL_UP)  # pressed = 0


# ---- helpers ----
class Edge:
    """Turns a button pin into "was it just pressed?" events (with debounce)."""
    def __init__(self, pin):
        self.pin = pin
        self.last = 1
        self.t = 0

    def pressed(self):
        v = self.pin.value()
        hit = False
        if v != self.last and time.ticks_diff(time.ticks_ms(), self.t) > 30:
            self.t = time.ticks_ms()
            hit = v == 0  # pulled up: 0 means pressed
            self.last = v
        return hit


_glyph = framebuf.FrameBuffer(bytearray(8), 8, 8, framebuf.MONO_HLSB)


def big_text(s, x, y, scale=2):
    """Draw text scaled up (the built-in font is only 8 px tall)."""
    for ch in s:
        _glyph.fill(0)
        _glyph.text(ch, 0, 0, 1)
        for yy in range(8):
            for xx in range(8):
                if _glyph.pixel(xx, yy):
                    oled.fill_rect(x + xx * scale, y + yy * scale, scale, scale, 1)
        x += 8 * scale


def magnitude():
    ax, ay, az = imu.accel()
    return math.sqrt(ax * ax + ay * ay + az * az)


def cadence(now):
    """Steps per minute from the average gap between the last few steps."""
    if len(step_times) < 2 or time.ticks_diff(now, step_times[-1]) > 2000:
        return 0  # stopped walking
    gaps = [time.ticks_diff(step_times[i + 1], step_times[i]) for i in range(len(step_times) - 1)]
    return 60000 // (sum(gaps) // len(gaps))


def reset():
    global steps, buckets, step_times, bucket_start
    steps = 0
    buckets = [0] * BUCKETS
    step_times = []
    bucket_start = time.ticks_ms()


def draw(now):
    km = steps * STEP_LENGTH_M / 1000
    kcal = km * WEIGHT_KG * 0.5   # walking burns roughly 0.5 kcal per kg per km
    oled.fill(0)
    big_text(str(steps), 0, 0)
    oled.text("steps", 128 - 40, 4)
    oled.hline(0, 19, 128, 1)
    oled.text("{} spm".format(cadence(now)), 0, 24)
    oled.text("{:.0f} m".format(km * 1000) if km < 1 else "{:.2f} km".format(km), 0, 36)
    oled.text("{:.1f} kcal".format(kcal), 0, 48)
    # bar graph: steps per 10 s over the last minute (newest bar on the right)
    top = max(max(buckets), 20)
    for i, n in enumerate(buckets):
        h = n * 36 // top
        x = 86 + i * 7
        oled.fill_rect(x, 63 - h, 6, h, 1)
    oled.hline(86, 63, 42, 1)
    oled.show()


# ---- state ----
reset()
btn = Edge(reset_btn)
lp = magnitude()        # low-pass filtered magnitude (g)
base = lp               # slow average: what "standing still" looks like
armed = True            # ready to count the next bump?
peak = 0.0              # highest value in the current bump
last_screen = time.ticks_ms()
last_print = time.ticks_ms()
next_sample = time.ticks_ms()

# ---- startup ----
print("Step counter starting... walk with the sensor!")

# ---- main loop ----
while True:
    now = time.ticks_ms()

    # 1-3: filter the acceleration
    mag = magnitude()
    lp += SMOOTHING * (mag - lp)
    base += 0.02 * (lp - base)       # ~1 s time constant
    rise = lp - base

    # 4: peak detection with hysteresis
    if armed and rise > STEP_THRESHOLD_G:
        if lp >= peak:
            peak = lp                # still climbing
        else:                        # just passed the top of the bump
            armed = False
            if not step_times or time.ticks_diff(now, step_times[-1]) >= MIN_STEP_MS:
                steps += 1
                buckets[-1] += 1
                step_times.append(now)
                if len(step_times) > 8:
                    step_times.pop(0)
    elif not armed and rise < REARM_G:
        armed = True
        peak = 0.0

    # move the bar graph along every 10 s
    if time.ticks_diff(now, bucket_start) >= BUCKET_S * 1000:
        bucket_start = time.ticks_add(bucket_start, BUCKET_S * 1000)
        buckets.pop(0)
        buckets.append(0)

    if btn.pressed():
        reset()
        print("Reset")

    if time.ticks_diff(now, last_screen) >= SCREEN_MS:
        last_screen = now
        draw(now)

    if time.ticks_diff(now, last_print) >= 1000:
        last_print = now
        print("Steps {} | {} spm | {:.0f} m".format(steps, cadence(now), steps * STEP_LENGTH_M))

    # keep a steady 50 Hz, however long the screen update took
    next_sample = time.ticks_add(next_sample, SAMPLE_MS)
    wait = time.ticks_diff(next_sample, time.ticks_ms())
    if wait > 0:
        time.sleep_ms(wait)
    else:
        next_sample = time.ticks_ms()
`;

// ------------------------------------------------------------------ Raspberry Pi weather dashboard

const PI_WEATHER = String.raw`# Raspberry Pi Weather Dashboard
# Sparkbench advanced example for the Raspberry Pi 4 (Python 3 + gpiozero).
#
# Downloads the forecast from open-meteo.com (free, no API key) and shows it on a small
# OLED in three pages: NOW, TODAY and the NEXT 3 DAYS. Press the button to flip pages.
# A red LED warns you to take an umbrella when the chance of rain today is 50 % or more.
#
# Wiring:
#   OLED (I2C)          SDA=GPIO2  SCL=GPIO3
#   Page button         GPIO4 (internal pull-up, button to GND)
#   Rain warning LED    GPIO5 (through a 220 ohm resistor)
#
# Needs: pip install requests smbus2 gpiozero   (oled.py is the small driver next to this file)

import time
import requests
from gpiozero import Button, LED
from oled import OLED

# ---- settings you can tweak ----
LATITUDE = 40.71           # where to get the weather for (New York; change to yours)
LONGITUDE = -74.01
RAIN_WARN_PCT = 50         # LED on when today's rain chance is at least this
UPDATE_EVERY_S = 15 * 60   # download a new forecast every 15 minutes
RETRY_S = 60               # after a failed download, try again this soon
LOOP_S = 0.05              # main loop period

# ---- hardware setup ----
oled = OLED(bus=1, addr=0x3C)
button = Button(4, pull_up=True)
rain_led = LED(5)

WEATHER_URL = ("https://api.open-meteo.com/v1/forecast?latitude={:.4f}&longitude={:.4f}"
               "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
               "&hourly=precipitation_probability"
               "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
               "&timezone=auto&forecast_days=3")

# WMO weather codes -> words (https://open-meteo.com/en/docs)
SKY = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog",
       51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 56: "Icy drizzle", 57: "Icy drizzle",
       61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Icy rain", 67: "Icy rain",
       71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow", 80: "Showers",
       81: "Showers", 82: "Downpour", 85: "Snow showers", 86: "Snow showers",
       95: "Thunder", 96: "Thunder", 99: "Thunder"}
DAY_NAMES = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
PAGE_NAMES = ("NOW", "TODAY", "3 DAYS")


# ---- helpers ----
def now_s():
    return time.monotonic()


class Edge:
    """Turns a gpiozero Button into "was it just pressed?" events."""
    def __init__(self, button):
        self.button = button
        self.last = False

    def pressed(self):
        v = self.button.is_pressed
        hit = v and not self.last
        self.last = v
        return hit


def weekday(date):
    """Day name for a "YYYY-MM-DD" string (Sakamoto's method, 0 = Sunday)."""
    y, m, d = int(date[0:4]), int(date[5:7]), int(date[8:10])
    t = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    if m < 3:
        y -= 1
    return DAY_NAMES[(y + y // 4 - y // 100 + y // 400 + t[m - 1] + d) % 7]


def fetch_weather():
    """Download the forecast. Returns a dict, or None if anything went wrong."""
    try:
        r = requests.get(WEATHER_URL.format(LATITUDE, LONGITUDE), timeout=10)
        r.raise_for_status()
        data = r.json()
        cur = data["current"]
        day = data["daily"]
        w = {
            "temp": cur["temperature_2m"], "feels": cur.get("apparent_temperature", cur["temperature_2m"]),
            "hum": cur["relative_humidity_2m"], "wind": cur["wind_speed_10m"], "code": cur["weather_code"],
            "days": [],
            "rain_next": None,
        }
        for i in range(len(day["time"])):
            rain = day.get("precipitation_probability_max", [None] * len(day["time"]))[i]
            w["days"].append((day["time"][i], day["weather_code"][i], day["temperature_2m_max"][i],
                              day["temperature_2m_min"][i], rain if rain is not None else 0))
        # Rain chance over the next 6 hours, if the hourly data is there.
        hourly = data.get("hourly", {})
        probs = hourly.get("precipitation_probability")
        if probs:
            hour = cur["time"][:13]
            times = hourly["time"]
            start = 0
            for i in range(len(times)):
                if times[i][:13] == hour:
                    start = i
                    break
            nxt = [p for p in probs[start:start + 6] if p is not None]
            w["rain_next"] = max(nxt) if nxt else None
        return w
    except Exception as e:  # no network, HTTP error, unexpected JSON...
        print("Weather download failed:", e)
        return None


def header(title):
    """Page title on the left, page number on the right, line underneath."""
    oled.fill(0)
    oled.text(title, 0, 0)
    right = "{}/{}".format(page + 1, len(PAGE_NAMES))
    oled.text(right, 128 - len(right) * 8, 0)
    oled.hline(0, 10, 128, 1)


def draw():
    if weather is None:
        header("OFFLINE")
        oled.text("No forecast yet", 0, 16)
        oled.text("Check the", 0, 32)
        oled.text("network cable", 0, 42)
        oled.text("or Wi-Fi.", 0, 52)
        oled.show()
        return
    w = weather
    today = w["days"][0]
    header(PAGE_NAMES[page])
    if page == 0:      # NOW
        oled.text("{:.1f} C".format(w["temp"]), 0, 14)
        oled.text(SKY.get(w["code"], "?")[:16], 0, 24)
        oled.text("Feels {:.1f} C".format(w["feels"]), 0, 34)
        oled.text("Hum {:.0f}% {:.0f} km/h".format(w["hum"], w["wind"]), 0, 44)
        oled.text(("Upd " + updated) if not stale else "Offline " + updated, 0, 56)
    elif page == 1:    # TODAY
        oled.text(SKY.get(today[1], "?")[:16], 0, 14)
        oled.text("High {:.0f} C".format(today[2]), 0, 24)
        oled.text("Low  {:.0f} C".format(today[3]), 0, 34)
        rain = "Rain {:d}%".format(int(today[4]))
        if w["rain_next"] is not None:
            rain += " 6h:{:d}%".format(int(w["rain_next"]))   # next 6 hours
        oled.text(rain, 0, 44)
        # rain-chance bar: the whole width is 100 %
        oled.rect(0, 55, 128, 8, 1)
        oled.fill_rect(0, 55, int(today[4]) * 128 // 100, 8, 1)
        oled.vline(RAIN_WARN_PCT * 128 // 100, 53, 11, 1)   # tick mark at the warning level
    else:              # 3 DAYS: two lines per day
        for i, d in enumerate(w["days"][:3]):
            y = 13 + i * 17
            oled.text("{} {:.0f}/{:.0f}C".format(weekday(d[0]), d[2], d[3]), 0, y)
            rain = "{:d}%".format(int(d[4]))
            oled.text(rain, 128 - len(rain) * 8, y)
            oled.text(SKY.get(d[1], "?")[:14], 16, y + 8)
    oled.show()


# ---- state ----
weather = None
stale = False           # True when the last download failed (showing old data)
updated = "--:--"
page = 0
btn = Edge(button)
next_fetch = now_s()    # fetch straight away

# ---- startup ----
print("Raspberry Pi weather dashboard starting...")
header("WEATHER")
oled.text("Downloading...", 0, 24)
oled.show()

# ---- main loop ----
while True:
    if now_s() >= next_fetch:
        w = fetch_weather()
        if w:
            weather, stale = w, False
            updated = time.strftime("%H:%M")
            next_fetch = now_s() + UPDATE_EVERY_S
            today = w["days"][0]
            print("Now {:.1f} C {} | today {:.0f}/{:.0f} C, rain {}%".format(w["temp"], SKY.get(w["code"], "?"), today[2], today[3], today[4]))
            print("Next days: " + " | ".join("{} {:.0f}/{:.0f} {}%".format(weekday(d[0]), d[2], d[3], d[4]) for d in w["days"]))
        else:
            stale = True
            next_fetch = now_s() + RETRY_S
        # Umbrella LED: on when today's chance of rain reaches the warning level.
        rain_today = weather["days"][0][4] if weather else 0
        rain_led.value = 1 if rain_today >= RAIN_WARN_PCT else 0
        print("Rain warning LED", "ON" if rain_led.value else "off", "({}% today)".format(rain_today))
        draw()
    if btn.pressed():
        page = (page + 1) % len(PAGE_NAMES)
        print("Page {}/{}: {}".format(page + 1, len(PAGE_NAMES), PAGE_NAMES[page]))
        draw()
    time.sleep(LOOP_S)
`;

export const ADVANCED_FIRMWARE: Record<string, string> = {
  'esp32-eink-weather': EINK_WEATHER,
  'esp32-internet-clock': INTERNET_CLOCK,
  'pico-simon': SIMON,
  'esp32-pedometer': PEDOMETER,
  'rpi-weather-dashboard': PI_WEATHER,
};
