#!/usr/bin/env python3
import os
import re
import json
from PIL import Image

# Archivos de temporada: Season_1_Icon.jpg / Season_1_icon.jpg
season_icon_re = re.compile(r"^Season_(\d{1,2})_(Icon|icon)\.jpg$", re.IGNORECASE)

OUTPUT_FILE = "season_colors.json"


def average_color_hex(image_path: str, resize_to=(64, 64)) -> str:
    """
    Calcula el color medio de la imagen y lo devuelve en formato #RRGGBB.
    Redimensiona para acelerar y estabilizar el cálculo.
    """
    img = Image.open(image_path).convert("RGB")
    img = img.resize(resize_to)

    pixels = list(img.getdata())
    n = len(pixels)
    r = sum(p[0] for p in pixels) // n
    g = sum(p[1] for p in pixels) // n
    b = sum(p[2] for p in pixels) // n

    return f"#{r:02X}{g:02X}{b:02X}"


def main():
    files = os.listdir(".")

    # seasonNumber -> {"file": "...", "avgColor": "#RRGGBB"}
    result = {}

    for f in files:
        m = season_icon_re.match(f)
        if not m:
            continue

        season_num = int(m.group(1))
        try:
            color = average_color_hex(f)
        except Exception as e:
            print(f"[WARN] No se pudo procesar {f}: {e}")
            continue

        result[str(season_num)] = {"file": f, "avgColor": color}

    payload = {
        "generatedFrom": "assets/carousel",
        "seasons": result,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, indent=2)

    print(f"OK -> generado {OUTPUT_FILE}")
    print(f"Temporadas detectadas: {len(result)}")


if __name__ == "__main__":
    main()