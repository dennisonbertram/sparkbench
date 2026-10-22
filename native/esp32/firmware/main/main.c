// SPDX-License-Identifier: MIT
#include <stdio.h>

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define LED_GPIO GPIO_NUM_2
#define BUTTON_GPIO GPIO_NUM_4

void app_main(void)
{
    gpio_config_t led = {
        .pin_bit_mask = 1ULL << LED_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config_t button = {
        .pin_bit_mask = 1ULL << BUTTON_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&led));
    ESP_ERROR_CHECK(gpio_config(&button));

    puts("SPARKBENCH_ESP32_BOOT");
    int led_level = 0;
    for (;;) {
        const int pressed = gpio_get_level(BUTTON_GPIO) == 0;
        if (pressed) {
            led_level = 1;
        } else {
            led_level = !led_level;
        }
        gpio_set_level(LED_GPIO, led_level);
        printf("SPARKBENCH_BUTTON=%s LED=%d\n", pressed ? "pressed" : "released", led_level);
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
