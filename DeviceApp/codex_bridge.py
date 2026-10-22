"""Private, single-workspace Codex app-server client. Never run the agent as root."""
import atexit
import copy
import hashlib
import hmac
import json
import os
from pathlib import Path
import pwd
import secrets
import signal
import subprocess
import threading
import time
from collections import deque

from flask import Blueprint, jsonify, request


class CodexError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class CodexBridge:
    def __init__(self, config_path=None):
        self.config_path = Path(config_path or os.environ.get("MINITV_CODEX_CONFIG", "/etc/minitv-codex.json"))
        self.lock = threading.RLock()
        self.start_lock = threading.Lock()
        self.action_lock = threading.Lock()
        self.write_lock = threading.Lock()
        self.process = None
        self.reader = None
        self.pending = {}
        self.serial = 0
        self.sessions = {}
        self.attempts = deque()
        self.thread = None
        self.approvals = {}
        self.account = None
        self.login = None
        self.error = ""
        self.busy = False
        self.diff = ""

    def config(self):
        try:
            stat = self.config_path.stat()
            if stat.st_mode & 0o022 or (os.geteuid() == 0 and stat.st_uid != 0):
                raise CodexError("La configuración de Codex debe pertenecer a root y no ser escribible por otros.", 503)
            config = json.loads(self.config_path.read_text())
            for key in ("user", "home", "workspace", "binary", "salt", "passwordHash"):
                if not isinstance(config.get(key), str) or not config[key]:
                    raise ValueError(key)
            return config
        except (OSError, ValueError, TypeError) as exc:
            raise CodexError("Ejecuta sudo bash DeviceApp/install_codex_support.sh en la Raspberry.", 503) from exc

    def status(self):
        try:
            config = self.config()
            ready = Path(config["binary"]).is_file() and (Path(config["workspace"]) / ".git").exists()
            return {"configured": ready, "message": "" if ready else "Repite el instalador de Codex."}
        except CodexError as exc:
            return {"configured": False, "message": str(exc)}

    def unlock(self, password):
        config = self.config()
        if not isinstance(password, str) or not 1 <= len(password) <= 256:
            raise CodexError("Introduce la clave de administrador.")
        with self.lock:
            now = time.monotonic()
            while self.attempts and self.attempts[0] < now - 60:
                self.attempts.popleft()
            if len(self.attempts) >= 5:
                raise CodexError("Demasiados intentos. Espera un minuto.", 429)
            self.attempts.append(now)
            if not hmac.compare_digest(password_hash(password, config["salt"]), config["passwordHash"]):
                raise CodexError("Clave de administrador incorrecta.", 403)
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            if len(self.sessions) >= 20:
                self.sessions.pop(next(iter(self.sessions)))
            token = secrets.token_urlsafe(32)
            self.sessions[token] = now + 8 * 3600
            return {"token": token}

    def authorize(self, token):
        with self.lock:
            if self.sessions.get(token, 0) <= time.monotonic():
                raise CodexError("Desbloquea Codex con la clave de administrador.", 403)

    def launch_options(self):
        config = self.config()
        user = pwd.getpwnam(config["user"])
        if user.pw_uid == 0 or os.geteuid() not in (0, user.pw_uid):
            raise CodexError("Codex requiere un usuario sin privilegios propio.", 503)
        home = str(Path(config["home"]).resolve())
        workspace = str(Path(config["workspace"]).resolve())
        if not Path(workspace, ".git").exists():
            raise CodexError("No se encuentra la copia de desarrollo del proyecto.", 503)
        # Do not inherit the API's OpenAI keys, SSH agent, PIN or other credentials.
        env = {"HOME": home, "CODEX_HOME": str(Path(home, ".codex")),
               "USER": user.pw_name, "LOGNAME": user.pw_name, "LANG": "C.UTF-8", "SHELL": "/bin/bash",
               "PATH": f"{Path(config['binary']).parent}:/usr/local/bin:/usr/bin:/bin"}
        options = {"cwd": workspace, "env": env, "start_new_session": True}
        if os.geteuid() == 0:
            options.update(user=user.pw_uid, group=user.pw_gid, extra_groups=[])
        return config, options

    def command(self, config):
        return [config["binary"], "app-server", "--listen", "stdio://"]

    def initialize_params(self):
        return {"clientInfo": {"name": "minitv_dashboard", "title": "MiniTV", "version": "1.0.0"},
                "capabilities": {"experimentalApi": False}}

    def start(self):
        with self.start_lock:
            if self.process and self.process.poll() is None:
                return
            restarting = self.process is not None
            try:
                config, options = self.launch_options()
                process = subprocess.Popen(self.command(config),
                                           stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                           stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1, **options)
            except (OSError, KeyError) as exc:
                raise CodexError("No se pudo iniciar Codex. Comprueba la instalación.", 503) from exc
            with self.lock:
                self.process = process
                self.error = "Codex se ha reiniciado. Abre la conversación en el historial para revisar el resultado antes de continuar." if restarting else ""
                self.login = None
                self.thread = None
                self.busy = False
                self.approvals.clear()
            self.reader = threading.Thread(target=self._read, args=(process,), daemon=True)
            self.reader.start()
            try:
                self.rpc("initialize", self.initialize_params())
                self._write({"method": "initialized"})
                result = self.rpc("account/read", {"refreshToken": False})
                with self.lock:
                    self.account = result.get("account")
            except Exception:
                self.close()
                raise

    def _write(self, message):
        with self.write_lock:
            try:
                if not self.process or self.process.poll() is not None:
                    raise OSError("stopped")
                self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
                self.process.stdin.flush()
            except (OSError, ValueError) as exc:
                raise CodexError("Codex se ha desconectado. Recarga la sección.", 503) from exc

    def rpc(self, method, params, timeout=25):
        with self.lock:
            self.serial += 1
            request_id = self.serial
            entry = {"event": threading.Event()}
            self.pending[request_id] = entry
        try:
            self._write({"id": request_id, "method": method, "params": params})
            if not entry["event"].wait(timeout):
                # A timed-out turn might still execute: stop the process before permitting a retry.
                self.close()
                raise CodexError("Codex no ha respondido a tiempo. Se ha detenido la conexión; revisa el historial antes de reintentar.", 504)
            if "error" in entry:
                raise CodexError(str(entry["error"].get("message", "Error de Codex")), 502)
            return entry.get("result", {})
        finally:
            with self.lock:
                self.pending.pop(request_id, None)

    def _read(self, process):
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                    if not isinstance(message, dict):
                        continue
                    if "method" not in message:
                        with self.lock:
                            entry = self.pending.get(message.get("id"))
                            if entry:
                                entry.update(message)
                                entry["event"].set()
                    elif "id" in message:
                        self._server_request(message)
                    else:
                        self._notification(message)
                except (ValueError, TypeError, KeyError):
                    continue
        finally:
            with self.lock:
                if self.process is process:
                    self.busy = False
                    self.approvals.clear()
                    self.error = "La conexión con Codex se ha cerrado. El historial guardado sigue disponible."
                    for entry in self.pending.values():
                        entry["error"] = {"message": self.error}
                        entry["event"].set()

    def _server_request(self, message):
        method = message["method"]
        if method in {"item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput"}:
            with self.lock:
                self.approvals[str(message["id"])] = message
        elif method == "item/permissions/requestApproval":
            self._write({"id": message["id"], "result": {"permissions": {}, "scope": "turn"}})
        elif method == "mcpServer/elicitation/request":
            self._write({"id": message["id"], "result": {"action": "decline", "content": None}})
        else:
            self._write({"id": message["id"], "error": {"code": -32601, "message": "Unsupported dashboard request"}})

    def _turn(self, turn_id):
        if not self.thread or not turn_id:
            return None
        turns = self.thread.setdefault("turns", [])
        for turn in turns:
            if turn["id"] == turn_id:
                return turn
        turn = {"id": turn_id, "items": [], "status": "inProgress"}
        turns.append(turn)
        return turn

    def _notification(self, message):
        method, params = message["method"], message.get("params", {})
        with self.lock:
            if method == "account/login/completed":
                self.login = {"completed": True, "success": params.get("success"), "error": params.get("error")}
                # account/updated follows; account/read on next reconnect supplies full details.
            elif method == "account/updated":
                self.account = {"type": params.get("authMode"), "planType": params.get("planType")} if params.get("authMode") else None
            elif method == "serverRequest/resolved":
                self.approvals.pop(str(params.get("requestId")), None)
            if not self.thread or params.get("threadId") != self.thread["id"]:
                return
            if method in {"turn/started", "turn/completed"}:
                source = params["turn"]
                turn = self._turn(source["id"])
                # Completion notifications may contain an empty items array.
                turn.update({k: v for k, v in source.items() if k != "items"})
                if source.get("items"):
                    turn["items"] = source["items"]
                self.busy = method == "turn/started"
                if not self.busy:
                    self.approvals.clear()
                    if source.get("error"):
                        self.error = source["error"].get("message", "Error de Codex")
            elif method in {"item/started", "item/completed"}:
                turn = self._turn(params.get("turnId"))
                if turn is not None:
                    item = params["item"]
                    existing = next((i for i in turn["items"] if i["id"] == item["id"]), None)
                    if existing is None:
                        turn["items"].append(item)
                    else:
                        existing.update(item)
            elif method in {"item/agentMessage/delta", "item/commandExecution/outputDelta", "item/plan/delta"}:
                turn = self._turn(params.get("turnId"))
                if turn is not None:
                    item = next((i for i in turn["items"] if i["id"] == params["itemId"]), None)
                    if item is None:
                        item = {"id": params["itemId"], "type": "agentMessage" if "agentMessage" in method else "commandExecution" if "commandExecution" in method else "plan"}
                        turn["items"].append(item)
                    field = "aggregatedOutput" if "commandExecution" in method else "text"
                    item[field] = (item.get(field, "") + params.get("delta", ""))[-100000:]
            elif method == "turn/diff/updated":
                self.diff = params.get("diff", "")[-200000:]
            elif method == "error":
                self.error = params.get("error", {}).get("message", "Error de Codex")

    def snapshot(self):
        self.start()
        with self.lock:
            result = copy.deepcopy({"thread": self.thread, "busy": self.busy, "account": self.account,
                                    "login": self.login, "error": self.error, "diff": self.diff,
                                    "approvals": list(self.approvals.values())})
        if result["thread"]:
            result["thread"]["turns"] = result["thread"].get("turns", [])[-30:]
            for turn in result["thread"]["turns"]:
                # Reasoning and unrelated internal tool payloads aren't dashboard messages.
                turn["items"] = [i for i in turn.get("items", []) if i.get("type") in
                                 {"userMessage", "agentMessage", "commandExecution", "fileChange", "plan"}]
                for item in turn["items"]:
                    if item.get("aggregatedOutput"):
                        item["aggregatedOutput"] = item["aggregatedOutput"][-20000:]
        return result

    def action(self, name, data):
        if not self.action_lock.acquire(blocking=False):
            raise CodexError("Hay otra operación en curso.", 409)
        try:
            self.start()
            workspace = str(Path(self.config()["workspace"]).resolve())
            if name == "threads":
                result = self.rpc("thread/list", {"cwd": workspace, "limit": 50, "sortKey": "updated_at", "sourceKinds": ["appServer", "cli", "vscode"],
                                                  "cursor": data.get("cursor")})
                return {"threads": [{"id": t["id"], "title": t.get("name") or t.get("preview") or "Codex",
                                      "updatedAt": t.get("updatedAt")} for t in result.get("data", [])
                                     if t.get("cwd") == workspace], "cursor": result.get("nextCursor")}
            if name == "stop":
                with self.lock:
                    turns = self.thread.get("turns", []) if self.thread else []
                    current = next((t for t in reversed(turns) if t.get("status") == "inProgress"), None)
                if self.busy and current:
                    self.rpc("turn/interrupt", {"threadId": self.thread["id"], "turnId": current["id"]})
                return {"ok": True}
            if name == "reply":
                self.reply(data)
                return {"ok": True}
            if self.busy:
                raise CodexError("Espera a que termine la tarea o detenla.", 409)
            if name == "login":
                if self.login and not self.login.get("completed"):
                    return self.login
                result = self.rpc("account/login/start", {"type": "chatgptDeviceCode"})
                with self.lock:
                    self.login = result
                return result
            if name == "logout":
                self.rpc("account/logout", {})
                with self.lock:
                    self.account = self.login = None
                return {"ok": True}
            if name == "select":
                thread_id = data.get("threadId")
                if thread_id is None:
                    with self.lock:
                        self.thread = None
                        self.diff = self.error = ""
                    return {"ok": True}
                if not isinstance(thread_id, str) or len(thread_id) > 128:
                    raise CodexError("Conversación inválida.")
                stored = self.rpc("thread/read", {"threadId": thread_id, "includeTurns": True})["thread"]
                if stored.get("cwd") != workspace:
                    raise CodexError("Esta conversación no pertenece al proyecto.", 403)
                result = self.rpc("thread/resume", {"threadId": thread_id, "cwd": workspace,
                                                    "sandbox": "workspace-write", "approvalPolicy": "on-request"})
                with self.lock:
                    self.thread = result["thread"]
                    self.diff = self.error = ""
                return {"ok": True}
            if name == "send":
                prompt = data.get("prompt")
                if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16000:
                    raise CodexError("Escribe un mensaje de hasta 16.000 caracteres.")
                if not self.account:
                    raise CodexError("Conecta tu cuenta de ChatGPT antes de enviar un mensaje.", 409)
                if self.thread is None:
                    result = self.rpc("thread/start", {"cwd": workspace, "sandbox": "workspace-write", "approvalPolicy": "on-request",
                        "developerInstructions": "Trabaja en esta copia de desarrollo de MiniTV. No despliegues, reinicies servicios ni modifiques la instalación en uso. Explica los cambios y las pruebas en el idioma del usuario."})
                    with self.lock:
                        self.thread = result["thread"]
                with self.lock:
                    self.busy = True
                    self.error = self.diff = ""
                try:
                    result = self.rpc("turn/start", {"threadId": self.thread["id"], "cwd": workspace,
                        "input": [{"type": "text", "text": prompt.strip()}], "approvalPolicy": "on-request",
                        "sandboxPolicy": {"type": "workspaceWrite", "writableRoots": [workspace], "networkAccess": False}})
                    with self.lock:
                        self._turn(result["turn"]["id"])
                    return {"ok": True}
                except Exception:
                    with self.lock:
                        self.busy = False
                    raise
            raise CodexError("Operación desconocida.", 404)
        finally:
            self.action_lock.release()

    def reply(self, data):
        with self.lock:
            pending = self.approvals.get(str(data.get("id")))
            if not pending:
                raise CodexError("Esta solicitud ya no está pendiente.", 409)
            if pending["method"] == "item/tool/requestUserInput":
                answers = data.get("answers")
                questions = pending["params"].get("questions", [])
                if not isinstance(answers, dict) or any(not isinstance(answers.get(q["id"]), str) or
                                                       not 1 <= len(answers[q["id"]].strip()) <= 4000 for q in questions):
                    raise CodexError("Responde a todas las preguntas.")
                result = {"answers": {q["id"]: {"answers": [answers[q["id"]].strip()]} for q in questions}}
            else:
                decision = data.get("decision")
                if decision not in {"accept", "decline", "cancel"}:
                    raise CodexError("Decisión inválida.")
                result = {"decision": decision}
            self._write({"id": pending["id"], "result": result})
            self.approvals.pop(str(pending["id"]), None)

    def close(self):
        process = self.process
        if process and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            except ProcessLookupError:
                pass
        if self.reader and self.reader is not threading.current_thread():
            self.reader.join(timeout=3)
        if process:
            for stream in (process.stdin, process.stdout):
                if stream:
                    stream.close()


def create_codex_blueprint(bridge=None):
    bridge = bridge or CodexBridge()
    blueprint = Blueprint("codex", __name__, url_prefix="/codex")
    atexit.register(bridge.close)

    @blueprint.before_request
    def authenticate():
        if request.content_length and request.content_length > 65536:
            raise CodexError("Petición demasiado grande.", 413)
        # Header-only credentials and no CORS prevent cross-site form/JS access.
        if request.path not in {"/codex/status", "/codex/unlock"}:
            bridge.authorize(request.headers.get("X-Codex-Session", ""))

    @blueprint.after_request
    def no_store(response):
        response.headers["Cache-Control"] = "no-store"
        return response

    @blueprint.errorhandler(CodexError)
    def error(exc):
        return jsonify({"error": str(exc)}), exc.status

    @blueprint.route("/status")
    def status():
        return jsonify(bridge.status())

    @blueprint.route("/unlock", methods=["POST"])
    def unlock():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise CodexError("Petición inválida.")
        return jsonify(bridge.unlock(data.get("password")))

    @blueprint.route("/lock", methods=["POST"])
    def lock():
        with bridge.lock:
            bridge.sessions.pop(request.headers.get("X-Codex-Session", ""), None)
        return jsonify({"ok": True})

    @blueprint.route("/state")
    def state():
        return jsonify(bridge.snapshot())

    @blueprint.route("/<action>", methods=["POST"])
    def action(action):
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise CodexError("Petición inválida.")
        return jsonify(bridge.action(action, data))

    return blueprint
