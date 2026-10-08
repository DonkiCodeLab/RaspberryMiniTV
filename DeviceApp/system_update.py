"""Fixed systemd job for updates, independent of the API's lifetime."""
import json
from pathlib import Path
import subprocess
import threading

UNIT = "minitv-update.service"
_start_lock = threading.Lock()
PROGRESS_PATH = Path("/run/minitv-update-progress.json")
PHASES = {"preparing", "backup", "downloading", "dependencies", "building", "restarting", "verifying"}


def update_phase(run_id):
    try:
        progress = json.loads(PROGRESS_PATH.read_text())
        if isinstance(progress, dict) and run_id and progress.get("runId") == run_id and progress.get("phase") in PHASES:
            return progress["phase"]
    except (OSError, ValueError, TypeError):
        pass
    return None


def update_status():
    result = subprocess.run(
        ["systemctl", "show", UNIT, "--property=LoadState,ActiveState,SubState,Result,ExecMainStatus,ExecMainStartTimestamp,InvocationID"],
        capture_output=True, text=True, timeout=10, check=True,
    )
    properties = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if properties.get("LoadState") != "loaded":
        state = "unavailable"
    elif properties.get("ActiveState") == "active" and properties.get("SubState") == "exited":
        state = "succeeded"
    elif properties.get("ActiveState") in {"activating", "active", "deactivating", "reloading"}:
        state = "running"
    elif properties.get("ActiveState") == "failed" or properties.get("Result", "success") != "success":
        state = "failed"
    elif properties.get("ExecMainStartTimestamp"):
        state = "succeeded"
    else:
        state = "idle"
    run_id = properties.get("InvocationID", "")
    return {"state": state, "runId": run_id,
            "phase": update_phase(run_id) if state in {"running", "failed"} else None,
            "startedAt": properties.get("ExecMainStartTimestamp", ""),
            "result": properties.get("Result", ""), "exitCode": properties.get("ExecMainStatus", "")}


def start_update():
    with _start_lock:
        status = update_status()
        if status["state"] == "unavailable":
            raise RuntimeError("Instala el servicio de actualización en la Raspberry.")
        if status["state"] != "running":
            subprocess.run(["systemctl", "restart", "--no-block", UNIT],
                           capture_output=True, text=True, timeout=10, check=True)
        return {"state": "running"}
