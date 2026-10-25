"""Narrow CORS support for the packaged LG app (file:// has origin 'null').

This only enables browser access. Every actual request still passes through
the existing PIN check; no administrative endpoints are exposed by this policy.
"""
import re

from flask import request


def allowed_methods(path):
    if path in {"/videos", "/users", "/tmdb/library", "/pictures/library", "/media/stream", "/pictures/content"}:
        return {"GET"}
    if path == "/web/auth":
        return {"POST"}
    if path == "/media/playback":
        return {"GET", "POST"}
    if re.fullmatch(r"/users/[A-Za-z0-9_-]+/state", path):
        return {"GET", "PATCH"}
    if re.fullmatch(r"/tmdb/images/[A-Za-z0-9_.-]+", path):
        return {"GET"}
    return set()


def register_tv_access(app):
    def permitted():
        # Do not grant arbitrary websites access to the home media server.
        return request.headers.get("Origin") == "null" and allowed_methods(request.path)

    @app.before_request
    def tv_preflight():
        if request.method != "OPTIONS" or not permitted():
            return None
        method = request.headers.get("Access-Control-Request-Method", "")
        headers = {part.strip().lower() for part in request.headers.get("Access-Control-Request-Headers", "").split(",") if part.strip()}
        if method not in allowed_methods(request.path) or headers - {"content-type", "x-web-pin", "range"}:
            return ("", 403)
        return ("", 204)

    @app.after_request
    def tv_response(response):
        if permitted() and (request.method in allowed_methods(request.path) or
                            (request.method == "OPTIONS" and response.status_code == 204)):
            response.headers["Access-Control-Allow-Origin"] = "null"
            response.headers["Access-Control-Allow-Methods"] = ", ".join(sorted(allowed_methods(request.path)))
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Web-Pin, Range"
            response.headers["Access-Control-Expose-Headers"] = "Content-Length, Content-Range"
            response.headers["Access-Control-Max-Age"] = "600"
            response.vary.add("Origin")
        return response
