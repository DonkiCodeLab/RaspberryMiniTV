import os
import time

import RPi.GPIO as GPIO

DISPLAY_ENABLE_PIN = 19
BUTTON_PIN = 26
POWER_PIN = 18

GPIO.setmode(GPIO.BCM)
os.system(f"raspi-gpio set {DISPLAY_ENABLE_PIN} ip")
GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.setup(POWER_PIN, GPIO.OUT)


def turn_on_screen():
    os.system(f"raspi-gpio set {DISPLAY_ENABLE_PIN} op a5")
    GPIO.output(POWER_PIN, GPIO.HIGH)


def turn_off_screen():
    os.system(f"raspi-gpio set {DISPLAY_ENABLE_PIN} ip")
    GPIO.output(POWER_PIN, GPIO.LOW)


# El sistema debe arrancar con la pantalla activa para que el menu se vea
# incluso antes de tocar el boton fisico.
turn_on_screen()
screen_on = True

while True:
    button_state = GPIO.input(BUTTON_PIN)
    if button_state != screen_on:
        screen_on = button_state
        if screen_on:
            turn_on_screen()
        else:
            turn_off_screen()
    time.sleep(0.3)
