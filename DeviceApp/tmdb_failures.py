"""Structured download failures and artwork context, including old jobs.json errors."""
import re

IMAGE_FIELDS = {
    "poster_path": "poster", "backdrop_path": "backdrop", "still_path": "still",
    "logo_path": "logo", "profile_path": "profile",
}
IMAGE_GROUPS = {"posters": "poster", "backdrops": "backdrop", "stills": "still",
                "logos": "logo", "profiles": "profile"}
IMAGE_PATTERN = r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)"


class PreparationError(RuntimeError):
    def __init__(self, failures):
        self.failures = merge_failures(failures)
        super().__init__("; ".join(f"{item['path']}: {item['error']}" for item in self.failures)[:4000])


def path_context(path):
    context = {}
    for key, pattern in (("season", r"/season/(\d+)"), ("episode", r"/episode/(\d+)")):
        match = re.search(pattern, path)
        if match:
            context[key] = int(match[1])
    return context


def image_contexts(data, path="", context=None, group=None):
    """Keep every use of a shared image, including season zero and extra variants."""
    context = {**path_context(path), **(context or {})}
    found = {}

    def add(image, usage):
        if isinstance(image, str) and re.fullmatch(IMAGE_PATTERN, image):
            entries = found.setdefault(image, [])
            if usage not in entries:
                entries.append(usage)

    if isinstance(data, dict):
        for field, key in (("season_number", "season"), ("episode_number", "episode")):
            if isinstance(data.get(field), int):
                context[key] = data[field]
        if "episode" in context and data.get("name"):
            context["episodeName"] = data["name"]
        for field, value in data.items():
            if field in IMAGE_FIELDS:
                usage = {**context, "type": IMAGE_FIELDS[field], "extra": False}
                if field == "profile_path" and data.get("name"):
                    usage["personName"] = data["name"]
                add(value, usage)
            elif field == "file_path":
                add(value, {**context, "type": group or "extra", "extra": True})
            else:
                for image, usages in image_contexts(value, context=context, group=IMAGE_GROUPS.get(field, group)).items():
                    for usage in usages:
                        add(image, usage)
    elif isinstance(data, list):
        for value in data:
            for image, usages in image_contexts(value, context=context, group=group).items():
                for usage in usages:
                    add(image, usage)
    return found


def failure(path, error, *, phase="metadata", width=None, contexts=None):
    return {"resource": "image" if re.fullmatch(IMAGE_PATTERN, path) else "metadata",
            "path": path, "error": str(error),
            "contexts": contexts or [{**path_context(path), "type": "metadata"}],
            "stages": [{"phase": phase, "width": width, "error": str(error)}]}


def merge_failures(failures):
    merged = {}
    for item in failures:
        key = (item["resource"], item["path"])
        if key not in merged:
            merged[key] = {**item, "contexts": [], "stages": []}
        for field in ("contexts", "stages"):
            for value in item.get(field, []):
                if value not in merged[key][field]:
                    merged[key][field].append(value)
        merged[key]["error"] = "; ".join(dict.fromkeys(stage["error"] for stage in merged[key]["stages"]))
    for item in merged.values():
        usages = {}
        for context in item["contexts"]:
            key = (context.get("type"), context.get("season"), context.get("episode"), context.get("personName"))
            previous = usages.get(key)
            # Inventories also contain the main artwork. Label it as extra only
            # when it is not a primary image for that same season/episode.
            if previous is None or (previous.get("extra") and not context.get("extra")):
                usages[key] = context
        item["contexts"] = list(usages.values())
    return list(merged.values())


def legacy_failures(error, contexts):
    failures = []
    for message in error.split("; "):
        match = re.match(rf"^(?:Miniatura )?({IMAGE_PATTERN})(?: \((\d+)\))?: (.+)$", message, re.S)
        if match:
            path, width, detail = match.groups()
            failures.append(failure(path, detail, phase="thumbnails" if width else "images",
                                    width=int(width) if width else None,
                                    contexts=contexts.get(path) or [{"type": "unknown"}]))
        else:
            match = re.match(r"^(?:Créditos )?(/(?:movie|tv)/[^:]+): (.+)$", message, re.S)
            path, detail = match.groups() if match else ("", message)
            failures.append(failure(path, detail))
    # Previous releases truncated the text; never silently dismiss unseen failures.
    if len(error) >= 4000:
        failures.append(failure("", "El detalle antiguo está incompleto. Reintenta para comprobar los recursos restantes."))
    return merge_failures(failures)
