/*
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Minimal Sparkbench QEMU bridge.  This process is intentionally kept
 * separate from the TypeScript application and links to the pinned QEMU
 * library through its public PICSimLab callback ABI.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <unistd.h>

typedef char Error;
typedef enum { QEMU_CLOCK_REALTIME = 0, QEMU_CLOCK_VIRTUAL = 1 } QEMUClockType;
typedef int64_t (*clock_get_ns_t)(QEMUClockType);
typedef void (*qemu_init_t)(int, char **, const char **);
typedef void (*qemu_main_loop_t)(void);
typedef void (*qemu_cleanup_t)(void);
typedef void (*qmp_quit_t)(Error **);
typedef void (*qmp_reset_t)(Error **);
typedef void (*lock_t)(const char *, int);
typedef void (*unlock_t)(void);
typedef void (*register_callbacks_t)(void *);
typedef void (*set_pin_t)(int, int);
typedef void (*uart_receive_t)(int, const uint8_t *, int);

typedef struct {
    void (*write_pin)(int, int);
    void (*dir_pin)(int, int);
    int (*i2c_event)(const uint8_t, const uint8_t, const uint16_t);
    uint8_t (*spi_event)(const uint8_t, const uint16_t);
    void (*uart_tx_event)(const uint8_t, const uint8_t);
    const int16_t *pinmap;
    void (*rmt_event)(const uint8_t, const uint32_t, const uint32_t);
} callbacks_t;

static pthread_mutex_t output_lock = PTHREAD_MUTEX_INITIALIZER;
typedef void (*bql_lock_t)(const char *, int);
typedef void (*bql_unlock_t)(void);
static bql_lock_t qemu_lock;
static bql_unlock_t qemu_unlock;
static set_pin_t set_pin;
static qmp_quit_t qmp_quit;
static qmp_reset_t qmp_reset;
static clock_get_ns_t clock_get_ns;
static const int16_t *pinmap;
static volatile sig_atomic_t stopping;

static void line(const char *fmt, ...)
{
    va_list ap;
    pthread_mutex_lock(&output_lock);
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    fputc('\n', stdout);
    fflush(stdout);
    pthread_mutex_unlock(&output_lock);
}

static int mapped_gpio(int pin)
{
    return pinmap && pin > 0 && pin <= pinmap[0] ? pinmap[pin] : -1;
}

static int mapped_pin(int gpio)
{
    if (!pinmap) return -1;
    for (int pin = 1; pin <= pinmap[0]; pin++) if (pinmap[pin] == gpio) return pin;
    return -1;
}

static void write_pin(int pin, int value)
{
    int gpio = mapped_gpio(pin);
    if (gpio >= 0) line("{\"type\":\"gpio\",\"gpio\":%d,\"value\":%d}", gpio, !!value);
}
static void dir_pin(int pin, int value)
{
    int gpio = mapped_gpio(pin);
    if (gpio >= 0) line("{\"type\":\"direction\",\"gpio\":%d,\"value\":%d}", gpio, !!value);
}
static void uart_tx(uint8_t id, uint8_t value) { line("{\"type\":\"serial\",\"id\":%u,\"value\":%u}", id, value); }
static int unsupported_i2c(uint8_t id, uint8_t addr, uint16_t event) {
    line("{\"type\":\"error\",\"message\":\"unsupported I2C callback\"}");
    (void)id; (void)addr; (void)event; return -1;
}
static uint8_t unsupported_spi(uint8_t id, uint16_t event) {
    line("{\"type\":\"error\",\"message\":\"unsupported SPI callback\"}");
    (void)id; (void)event; return 0;
}
static void unsupported_rmt(uint8_t ch, uint32_t cfg, uint32_t value) {
    line("{\"type\":\"error\",\"message\":\"unsupported RMT callback\"}");
    (void)ch; (void)cfg; (void)value;
}

static void *symbol(void *handle, const char *name)
{
    void *p = dlsym(handle, name);
    if (!p) { fprintf(stderr, "missing QEMU symbol %s\n", name); exit(2); }
    return p;
}

static void *input_loop(void *arg)
{
    (void)arg;
    char buf[512];
    while (!stopping && fgets(buf, sizeof(buf), stdin)) {
        int gpio, value;
        unsigned int mask, values;
        if (sscanf(buf, "{\"type\":\"sync\",\"mask\":%u,\"values\":%u}", &mask, &values) == 2) {
            if (qemu_lock) qemu_lock(__FILE__, __LINE__);
            for (int input = 0; input < 32; input++) {
                if (!(mask & (1U << input))) continue;
                int pin = mapped_pin(input);
                if (pin >= 0) set_pin(pin, !!(values & (1U << input)));
            }
            int64_t time_us = clock_get_ns(QEMU_CLOCK_VIRTUAL) / 1000;
            if (qemu_unlock) qemu_unlock();
            line("{\"type\":\"tick\",\"timeUs\":%lld}", (long long)time_us);
        } else if (sscanf(buf, "{\"type\":\"pin\",\"gpio\":%d,\"value\":%d}", &gpio, &value) == 2 &&
            gpio >= 0 && gpio < 32) {
            int pin = mapped_pin(gpio);
            if (pin >= 0) {
                if (qemu_lock) qemu_lock(__FILE__, __LINE__);
                set_pin(pin, !!value);
                if (qemu_unlock) qemu_unlock();
            }
        } else if (strstr(buf, "\"type\":\"reset\"")) {
            Error *err = NULL;
            if (qemu_lock) qemu_lock(__FILE__, __LINE__);
            qmp_reset(&err);
            if (qemu_unlock) qemu_unlock();
        } else if (strstr(buf, "\"type\":\"stop\"")) {
            Error *err = NULL;
            stopping = 1;
            if (qemu_lock) qemu_lock(__FILE__, __LINE__);
            qmp_quit(&err);
            if (qemu_unlock) qemu_unlock();
            break;
        }
    }
    if (!stopping) {
        Error *err = NULL;
        stopping = 1;
        if (qemu_lock) qemu_lock(__FILE__, __LINE__);
        qmp_quit(&err);
        if (qemu_unlock) qemu_unlock();
    }
    return NULL;
}

int main(int argc, char **argv)
{
    if (argc != 7) {
        fprintf(stderr, "usage: %s LIBQEMU ROM_DIR FLASH EFUSE INPUT_MASK INPUT_VALUES\n", argv[0]);
        return 2;
    }
    char *end = NULL;
    errno = 0;
    unsigned long startup_mask = strtoul(argv[5], &end, 10);
    if (errno || !end || *end || startup_mask > UINT32_MAX) return 2;
    errno = 0;
    unsigned long startup_values = strtoul(argv[6], &end, 10);
    if (errno || !end || *end || startup_values > UINT32_MAX) return 2;
    struct rlimit cpu = { 130, 130 }, as = { 4UL * 1024 * 1024 * 1024, 4UL * 1024 * 1024 * 1024 };
    if (setrlimit(RLIMIT_CPU, &cpu) != 0 || setrlimit(RLIMIT_AS, &as) != 0) {
        fprintf(stderr, "could not apply QEMU resource limits: %s\n", strerror(errno));
        return 2;
    }
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
        fprintf(stderr, "could not disable privilege gain: %s\n", strerror(errno));
        return 2;
    }

    void *lib = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!lib) { fprintf(stderr, "could not load QEMU: %s\n", dlerror()); return 2; }
    qemu_init_t qemu_init = (qemu_init_t)symbol(lib, "qemu_init");
    qemu_main_loop_t qemu_main_loop = (qemu_main_loop_t)symbol(lib, "qemu_main_loop");
    qemu_cleanup_t qemu_cleanup = (qemu_cleanup_t)symbol(lib, "qemu_cleanup");
    register_callbacks_t register_callbacks = (register_callbacks_t)symbol(lib, "qemu_picsimlab_register_callbacks");
    set_pin = (set_pin_t)symbol(lib, "qemu_picsimlab_set_pin");
    qmp_quit = (qmp_quit_t)symbol(lib, "qmp_quit");
    qmp_reset = (qmp_reset_t)symbol(lib, "qmp_system_reset");
    qemu_lock = (bql_lock_t)symbol(lib, "bql_lock_impl");
    qemu_unlock = (bql_unlock_t)symbol(lib, "bql_unlock");
    clock_get_ns = (clock_get_ns_t)symbol(lib, "qemu_clock_get_ns");

    static int16_t pinmap_data[33];
    pinmap_data[0] = 32;
    for (int i = 0; i < 32; i++) pinmap_data[i + 1] = (int16_t)i;
    pinmap = pinmap_data;
    callbacks_t callbacks = {
        write_pin, dir_pin, unsupported_i2c, unsupported_spi, uart_tx, pinmap_data, unsupported_rmt
    };
    register_callbacks(&callbacks);

    char drive[1024], efuse[1024];
    if (snprintf(drive, sizeof(drive), "file=%s,if=mtd,format=raw", argv[3]) >= (int)sizeof(drive) ||
        snprintf(efuse, sizeof(efuse), "file=%s,if=none,format=raw,id=efuse", argv[4]) >= (int)sizeof(efuse))
        return 2;
    char *qargv[] = {
        (char *)"sparkbench-qemu", (char *)"-M", (char *)"esp32-picsimlab",
        (char *)"-accel", (char *)"tcg,thread=single",
        (char *)"-L", argv[2], (char *)"-nographic", (char *)"-nodefaults",
        (char *)"-drive", drive, (char *)"-drive", efuse,
        (char *)"-global", (char *)"driver=nvram.esp32.efuse,property=drive,value=efuse",
        (char *)"-serial", (char *)"null", (char *)"-monitor", (char *)"none",
        (char *)"-nic", (char *)"none", (char *)"-global",
        (char *)"driver=timer.esp32.timg,property=wdt_disable,value=true", NULL
    };
    qemu_init((int)(sizeof(qargv) / sizeof(qargv[0]) - 1), qargv, NULL);
    for (int gpio = 0; gpio < 32; gpio++) {
        if (!(startup_mask & (1UL << gpio))) continue;
        int pin = mapped_pin(gpio);
        if (pin >= 0) set_pin(pin, !!(startup_values & (1UL << gpio)));
    }
    line("{\"type\":\"ready\"}");
    pthread_t input;
    if (pthread_create(&input, NULL, input_loop, NULL) != 0) return 2;
    qemu_main_loop();
    stopping = 1;
    pthread_cancel(input);
    pthread_join(input, NULL);
    qemu_cleanup();
    dlclose(lib);
    return 0;
}
