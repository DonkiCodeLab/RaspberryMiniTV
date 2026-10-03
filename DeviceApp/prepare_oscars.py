"""Prepare or inspect the permanent Oscars collection without opening the WebApp."""
import argparse
import json
import time

from control_api import oscar_artwork


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read local status without downloading')
    args = parser.parse_args()
    if args.check:
        snapshot = oscar_artwork.snapshot('es-ES')
        print(json.dumps({'winners': len(snapshot['winners']),
                          'posters': sum(bool(w['posterPath']) for w in snapshot['winners']),
                          'status': snapshot['status']}, ensure_ascii=False, indent=2))
        return 0
    oscar_artwork.prepare()
    while True:
        status = oscar_artwork.status()
        print(json.dumps({key: status[key] for key in ('total', 'complete', 'failed', 'pending', 'current')}, ensure_ascii=False), flush=True)
        if not (status['pending'] or status['running']):
            if status['errors']:
                print(json.dumps(status['errors'], ensure_ascii=False, indent=2))
            return int(bool(status['failed']))
        time.sleep(5)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print('\nPreparación interrumpida. Se reanudará desde los archivos guardados.')
