"""Complete installed movie/TV credits through the running API's resumable queue.

Run on the Raspberry: python3 DeviceApp/complete_media_credits.py
Use --check for a read-only inventory. Credentials are read locally, never printed.
"""
import argparse
import json
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Report current coverage without downloading")
    args = parser.parse_args()
    from control_api import current_web_pin, PORT

    def request(start=False):
        req = urllib.request.Request(
            f"http://127.0.0.1:{PORT}/tmdb/credits",
            headers={"X-Web-Pin": current_web_pin()}, method="POST" if start else "GET")
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)

    try:
        status = request(start=not args.check)
        while True:
            print(json.dumps(status, ensure_ascii=False), flush=True)
            if args.check or not (status["pending"] or status["running"]):
                return int(bool(status["remaining"] or status["missingIds"]))
            time.sleep(3)
            status = request()
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({"error": "No se pudo completar la consulta a la API local. Comprueba el servicio y su versión.",
                          "type": type(exc).__name__}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
