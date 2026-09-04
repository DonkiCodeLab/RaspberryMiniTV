import json
import os

with open(os.path.join(os.path.dirname(__file__), "..", "assets", "game_platforms.json"), encoding="utf-8") as handle:
    GAME_SYSTEMS = json.load(handle)
SYSTEMS = {s["id"]: s for s in GAME_SYSTEMS}
ALIASES = {s["appPlatformId"]: s["id"] for s in GAME_SYSTEMS if s.get("appPlatformId")}
EXTENSIONS = {"." + ext for s in GAME_SYSTEMS for ext in s["extensions"]}

def resolve_platform(filename, platform_id=None):
    extension = os.path.splitext(filename)[1].lower() if not filename.startswith(".") else filename.lower()
    key = ALIASES.get(platform_id, platform_id)
    if key:
        system = SYSTEMS.get(key)
        if not system or extension.lstrip(".") not in system["extensions"]:
            return None
    else:
        matches = [s for s in GAME_SYSTEMS if extension.lstrip(".") in s["extensions"]]
        system = SYSTEMS["neogeocd"] if extension == ".chd" else matches[0] if len(matches) == 1 else None
        if not system:
            return None
    return {**system, "id": system.get("appPlatformId") or system["id"]}

def stored_platform(filename, multimedia_dir):
    try:
        with open(os.path.join(multimedia_dir, "media_library.json"), encoding="utf-8") as handle:
            item = json.load(handle).get("games", {}).get("Games/" + os.path.basename(filename), {})
        return resolve_platform(os.path.basename(filename), item.get("platform")) or {}
    except (OSError, ValueError):
        return resolve_platform(os.path.basename(filename)) or {}
