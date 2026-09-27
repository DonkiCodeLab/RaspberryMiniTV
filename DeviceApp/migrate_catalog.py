#!/usr/bin/env python3
"""Import/check the local catalog, or make verified SQLite/JSON recovery copies."""
import argparse
import json
from pathlib import Path

import catalog_store


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=Path(__file__).resolve().parents[1] / "MultimediaContent/media_library.json")
    parser.add_argument("--export", type=Path, help="Export current SQLite data as JSON to a new file")
    parser.add_argument("--backup", type=Path, help="Create a consistent SQLite backup at a new path")
    args = parser.parse_args()
    try:
        result = catalog_store.check(args.catalog)
        if args.export:
            result["export"] = str(catalog_store.export_json(args.catalog, args.export))
        if args.backup:
            result["backup"] = str(catalog_store.backup(args.catalog, args.backup))
        print(json.dumps(result, ensure_ascii=False))
    except (catalog_store.CatalogError, OSError) as exc:
        parser.exit(1, f"Migración cancelada: {exc}\n")


if __name__ == "__main__":
    main()
